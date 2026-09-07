"""Planning (Section H, "Planning").

Structured output, not free-form ReAct: the planner returns a JSON array of steps
against a fixed schema, validated with Pydantic. An invalid plan gets one repair
attempt, then falls back to a template plan selected by intent.

Implemented here: the :class:`Planner` protocol, plan validation, and
:class:`TemplatePlanner`, the deterministic fallback the plan calls for ("For the
three demo intents, seed template plans so the demo path never depends on planner
creativity").

Not implemented: :class:`LLMPlanner`. It requires a routed generation with a JSON
schema; inventing a plan without one would be fabricated behaviour.
"""

from __future__ import annotations

from typing import Any, Protocol

from vajra.agent.models import Plan, PlanStep
from vajra.core.enums import Capability
from vajra.core.exceptions import NotImplementedYet, ValidationError
from vajra.router.models import TaskIntent, TaskSpec

#: JSON Schema the planner's structured output must satisfy.
PLAN_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["steps"],
    "additionalProperties": False,
    "properties": {
        "steps": {
            "type": "array",
            "minItems": 1,
            "maxItems": 8,
            "items": {
                "type": "object",
                "required": ["id", "description"],
                "additionalProperties": False,
                "properties": {
                    "id": {"type": "string", "minLength": 1},
                    "description": {"type": "string", "minLength": 1},
                    "required_caps": {
                        "type": "array",
                        "items": {"enum": [capability.value for capability in Capability]},
                    },
                    "tools": {"type": "array", "items": {"type": "string"}},
                    "depends_on": {"type": "array", "items": {"type": "string"}},
                },
            },
        }
    },
}

#: Template plans per intent. These are step *shapes*, expressed in capability
#: terms. No model is named; the router picks one per step at execution time.
TEMPLATE_PLANS: dict[TaskIntent, list[PlanStep]] = {
    TaskIntent.EXTRACT: [
        PlanStep(
            id="extract",
            description="Extract the requested fields from the attached document",
            required_caps=frozenset({Capability.VISION, Capability.STRUCTURED_OUTPUT}),
            tools=["vision.extract"],
        ),
        PlanStep(
            id="ground",
            description="Retrieve the governing procedure sections for the findings",
            required_caps=frozenset({Capability.TEXT}),
            tools=["knowledge.search"],
            depends_on=["extract"],
        ),
    ],
    TaskIntent.DOCUMENT_GENERATION: [
        PlanStep(
            id="extract",
            description="Extract source content from the attachments",
            required_caps=frozenset({Capability.DOC_UNDERSTANDING}),
            tools=["vision.extract"],
        ),
        PlanStep(
            id="ground",
            description="Retrieve supporting sections from the knowledge base",
            required_caps=frozenset({Capability.TEXT}),
            tools=["knowledge.search"],
            depends_on=["extract"],
        ),
        PlanStep(
            id="compose",
            description="Compose the document body with citations",
            required_caps=frozenset({Capability.REASONING, Capability.STRUCTURED_OUTPUT}),
            depends_on=["ground"],
        ),
        PlanStep(
            id="render",
            description="Render the composed content as a document artifact",
            required_caps=frozenset({Capability.TEXT}),
            tools=["document.generate"],
            depends_on=["compose"],
        ),
    ],
    TaskIntent.CODE: [
        PlanStep(
            id="inspect",
            description="Inspect the tabular input and describe its schema",
            required_caps=frozenset({Capability.CODING}),
            tools=["spreadsheet.read"],
        ),
        PlanStep(
            id="analyse",
            description="Write and execute analysis code in the sandbox",
            required_caps=frozenset({Capability.CODING}),
            tools=["python.execute"],
            depends_on=["inspect"],
        ),
        PlanStep(
            id="report",
            description="Write the computed results to a spreadsheet artifact",
            required_caps=frozenset({Capability.CODING}),
            tools=["spreadsheet.write"],
            depends_on=["analyse"],
        ),
    ],
    TaskIntent.ANALYSE: [
        PlanStep(
            id="ground",
            description="Retrieve relevant knowledge base sections",
            required_caps=frozenset({Capability.TEXT}),
            tools=["knowledge.search"],
        ),
        PlanStep(
            id="analyse",
            description="Analyse the retrieved material against the request",
            required_caps=frozenset({Capability.REASONING}),
            depends_on=["ground"],
        ),
    ],
    TaskIntent.QUESTION_ANSWER: [
        PlanStep(
            id="ground",
            description="Retrieve relevant knowledge base sections",
            required_caps=frozenset({Capability.TEXT}),
            tools=["knowledge.search"],
        ),
        PlanStep(
            id="answer",
            description="Answer from the retrieved material, with citations",
            required_caps=frozenset({Capability.REASONING}),
            depends_on=["ground"],
        ),
    ],
}

#: Used when an intent has no template: a single direct generation step.
DEFAULT_TEMPLATE: list[PlanStep] = [
    PlanStep(
        id="respond",
        description="Answer the request directly",
        required_caps=frozenset({Capability.TEXT}),
    )
]


def validate_plan(payload: dict[str, Any], *, source: str, max_steps: int = 8) -> Plan:
    """Validate a structured planner response into a :class:`Plan`."""
    raw_steps = payload.get("steps")
    if not isinstance(raw_steps, list) or not raw_steps:
        raise ValidationError("Plan must contain a non-empty 'steps' array")
    if len(raw_steps) > max_steps:
        raise ValidationError(
            f"Plan has {len(raw_steps)} steps, budget allows {max_steps}", max_steps=max_steps
        )
    try:
        steps = [PlanStep.model_validate(step) for step in raw_steps]
    except Exception as exc:
        raise ValidationError(f"Invalid plan step: {exc}") from exc

    seen: set[str] = set()
    for step in steps:
        if step.id in seen:
            raise ValidationError(f"Duplicate plan step id: {step.id!r}", step_id=step.id)
        seen.add(step.id)

    plan = Plan(steps=steps, source=source)
    if dangling := plan.validate_dag():
        raise ValidationError(f"Plan references unknown steps: {dangling}", unknown=dangling)
    return plan


def order_by_model_affinity(plan: Plan) -> Plan:
    """Group independent steps by required capabilities to minimise VRAM swaps.

    Section V, change 3: on single-resident hardware a run that alternates
    capabilities pays a swap each time. Reordering *independent* steps to group
    them by capability set cuts that. The ``depends_on`` DAG is respected, so
    correctness is unaffected.

    Implemented as a stable topological sort that prefers a ready step whose
    capability set matches the one just scheduled.
    """
    remaining = {step.id: step for step in plan.steps}
    scheduled: list[PlanStep] = []
    done: set[str] = set()
    current_caps: frozenset[Capability] | None = None

    while remaining:
        ready = [
            step
            for step in remaining.values()
            if all(dependency in done for dependency in step.depends_on)
        ]
        if not ready:
            # A cycle or a dangling dependency: leave the order untouched rather
            # than silently dropping steps.
            return plan
        preferred = [step for step in ready if step.required_caps == current_caps]
        chosen = (preferred or ready)[0]
        scheduled.append(chosen)
        done.add(chosen.id)
        current_caps = chosen.required_caps
        del remaining[chosen.id]

    return Plan(steps=scheduled, source=plan.source)


def swap_count(plan: Plan) -> int:
    """Number of capability-set changes across a plan. The before/after metric."""
    swaps = 0
    previous: frozenset[Capability] | None = None
    for step in plan.steps:
        if previous is not None and step.required_caps != previous:
            swaps += 1
        previous = step.required_caps
    return swaps


class Planner(Protocol):
    name: str

    async def plan(self, spec: TaskSpec) -> Plan: ...


class TemplatePlanner:
    """Deterministic planner. Selects a seeded template by intent."""

    name = "template"

    def __init__(self, templates: dict[TaskIntent, list[PlanStep]] | None = None) -> None:
        self._templates = templates or TEMPLATE_PLANS

    async def plan(self, spec: TaskSpec) -> Plan:
        steps = self._templates.get(spec.intent, DEFAULT_TEMPLATE)
        return Plan(steps=list(steps), source=self.name)


class LLMPlanner:
    """Structured-output planner backed by a routed model.

    Not implemented. Implementing it means: route a PLAN step, call
    ``RuntimeAdapter.chat`` with :data:`PLAN_SCHEMA` as ``json_schema``, validate
    with :func:`validate_plan`, allow one repair attempt, then fall back to
    :class:`TemplatePlanner`.
    """

    name = "llm"

    def __init__(self, fallback: Planner | None = None) -> None:
        self._fallback = fallback or TemplatePlanner()

    async def plan(self, spec: TaskSpec) -> Plan:
        raise NotImplementedYet(
            "LLM planning is not implemented. Use TemplatePlanner until a routed "
            "structured-output generation path exists.",
            task_id=spec.task_id,
        )
