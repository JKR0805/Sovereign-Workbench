"""Agent data contracts (Section H).

The state machine is hand-written and typed rather than a framework, because the
event stream is the product and a framework's callback model fights you for clean
per-node telemetry.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field

from vajra.core.enums import Capability


class AgentState(str, Enum):
    """The states of Section H."""

    INTAKE = "INTAKE"
    CLASSIFY = "CLASSIFY"
    ROUTE = "ROUTE"
    PLAN = "PLAN"
    EXECUTE_STEP = "EXECUTE_STEP"
    GENERATE = "GENERATE"
    TOOL_CALL = "TOOL_CALL"
    OBSERVE = "OBSERVE"
    VERIFY = "VERIFY"
    REPAIR = "REPAIR"
    ARTIFACT = "ARTIFACT"
    DONE = "DONE"
    FAILED = "FAILED"


class PlanStep(BaseModel):
    """One step of a plan. Fixed schema; the planner returns these, validated.

    Each step declares its own ``required_caps``, which is what makes per-step
    routing possible and is "the whole point of the product" (Section H).
    """

    model_config = ConfigDict(frozen=True)

    id: str
    description: str
    required_caps: frozenset[Capability] = frozenset()
    tools: list[str] = Field(default_factory=list)
    depends_on: list[str] = Field(default_factory=list)


class Plan(BaseModel):
    model_config = ConfigDict(frozen=True)

    steps: list[PlanStep]
    source: str
    """Which planner produced this: ``template``, ``llm`` or ``llm_repaired``."""

    def step(self, step_id: str) -> PlanStep | None:
        return next((step for step in self.steps if step.id == step_id), None)

    def validate_dag(self) -> list[str]:
        """Return dependency ids that reference no step. Empty means the DAG is closed."""
        known = {step.id for step in self.steps}
        return sorted(
            {
                dependency
                for step in self.steps
                for dependency in step.depends_on
                if dependency not in known
            }
        )


class RunBudget(BaseModel):
    """Hard budgets, enforced and displayed (Section H)."""

    model_config = ConfigDict(frozen=True)

    max_steps: int = 8
    max_tool_calls: int = 12
    max_wall_clock_s: float = 240.0
    max_repairs: int = 2


class BudgetUsage(BaseModel):
    """Consumption so far. Rendered as the thin bar in the run header."""

    steps: int = 0
    tool_calls: int = 0
    repairs: int = 0
    elapsed_s: float = 0.0

    def as_display(self, budget: RunBudget) -> dict[str, str]:
        return {
            "steps": f"{self.steps}/{budget.max_steps}",
            "tool_calls": f"{self.tool_calls}/{budget.max_tool_calls}",
            "repairs": f"{self.repairs}/{budget.max_repairs}",
            "wall_clock": f"{self.elapsed_s:.0f}s/{budget.max_wall_clock_s:.0f}s",
        }


class ToolInvocation(BaseModel):
    model_config = ConfigDict(frozen=True)

    tool: str
    arguments: dict[str, object] = Field(default_factory=dict)
    step_id: str | None = None


class VerificationResult(BaseModel):
    """Outcome of the verification gate (Section G, "Citations and grounding").

    ``unsupported_claims`` is the list the output document must carry explicitly.
    Being visibly willing to mark your own output unsupported is the point.
    """

    model_config = ConfigDict(frozen=True)

    passed: bool
    checked_claims: int = 0
    verified_claims: int = 0
    unsupported_claims: list[str] = Field(default_factory=list)
    unknown_citations: list[str] = Field(default_factory=list)
    detail: str | None = None


class StepResult(BaseModel):
    model_config = ConfigDict(frozen=True)

    step_id: str
    model_id: str | None = None
    output: str = ""
    tool_results: list[dict[str, object]] = Field(default_factory=list)
    verification: VerificationResult | None = None
    duration_ms: float = 0.0


class RunResult(BaseModel):
    """What a completed run produced."""

    run_id: str
    status: str
    output: str = ""
    steps: list[StepResult] = Field(default_factory=list)
    artifact_ids: list[str] = Field(default_factory=list)
    models_used: list[str] = Field(default_factory=list)
    budget_usage: BudgetUsage = BudgetUsage()
    started_at: datetime | None = None
    finished_at: datetime | None = None
    error: str | None = None
