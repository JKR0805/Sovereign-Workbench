"""Routing endpoints (Section M, "Routing").

``POST /api/routing/simulate`` is the endpoint the Workbench composer and the
Routing Studio's Score Simulator both call. It runs the full pipeline against the
live registry and returns a real :class:`~vajra.router.models.RoutingDecision`
without executing anything.

This module is where registry records become
:class:`~vajra.router.models.ModelCandidate` objects. Doing the conversion here
rather than inside the router is what keeps the router a pure function that never
touches the database and never sees a display name.
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from vajra.core.dependencies import AppContext, Context
from vajra.core.enums import Capability
from vajra.core.exceptions import NotFound
from vajra.orchestrator.candidates import build_candidates as _build_candidates
from vajra.orchestrator.candidates import load_policies as _load_policies
from vajra.router.classify import Attachment
from vajra.router.models import (
    ModelCandidate,
    RoutingContext,
    RoutingDecision,
    ScoringWeights,
    TaskSpec,
)
from vajra.router.policy import RoutingPolicy, parse_policy
from vajra.store.models import RoutingPolicyRecord
from vajra.store.repositories.policies import RoutingPolicyRepository

router = APIRouter(prefix="/api/routing", tags=["routing"])


class SimulateRequest(BaseModel):
    prompt: str
    attachments: list[Attachment] = Field(default_factory=list)
    weights: ScoringWeights | None = None
    task_labels: dict[str, str] = Field(default_factory=dict)


class SimulateResponse(BaseModel):
    task: TaskSpec
    decision: RoutingDecision


class PolicyRead(BaseModel):
    id: str
    name: str
    enabled: bool
    priority: int
    graph: dict[str, object] = Field(default_factory=dict)
    rules: list[dict[str, object]] = Field(default_factory=list)
    weights: dict[str, float] = Field(default_factory=dict)

    @classmethod
    def from_record(cls, record: RoutingPolicyRecord) -> PolicyRead:
        return cls(
            id=record.id,
            name=record.name,
            enabled=record.enabled,
            priority=record.priority,
            graph=dict(record.graph or {}),
            rules=list(record.rules or []),
            weights=dict(record.weights or {}),
        )


class PolicyWrite(BaseModel):
    name: str
    enabled: bool = True
    priority: int = 50
    graph: dict[str, object] = Field(default_factory=dict)
    rules: list[dict[str, object]] = Field(default_factory=list)
    weights: dict[str, float] = Field(default_factory=dict)


async def build_candidates(context: AppContext) -> tuple[list[ModelCandidate], RoutingContext]:
    """Assemble the candidate fleet and the hardware context from live state.

    Delegates to :mod:`vajra.orchestrator.candidates`, which the run executor
    calls directly. Keeping this thin wrapper here means ``/api/routing/simulate``
    and an actual run score against an identical candidate set.
    """
    return await _build_candidates(
        registry=context.registry, runtimes=context.runtimes, residency=context.residency
    )


async def load_policies(context: AppContext) -> list[RoutingPolicy]:
    """Load enabled policies from the database, validating each rule."""
    return await _load_policies(context.database)


@router.post("/simulate", response_model=SimulateResponse)
async def simulate(request: SimulateRequest, context: Context) -> SimulateResponse:
    """Classify and route without executing. The Score Simulator calls this."""
    spec = await context.router.classify("simulate", request.prompt, request.attachments)
    candidates, routing_context = await build_candidates(context)
    policies = await load_policies(context)
    decision = context.router.route(
        spec,
        candidates,
        routing_context,
        policies=policies,
        weights=request.weights,
        task_labels=request.task_labels,
    )
    return SimulateResponse(task=spec, decision=decision)


@router.get("/policies", response_model=list[PolicyRead])
async def list_policies(context: Context) -> list[PolicyRead]:
    async with context.database.session() as session:
        records = await RoutingPolicyRepository(session).list()
    return [PolicyRead.from_record(record) for record in records]


@router.put("/policies/{policy_id}", response_model=PolicyRead)
async def upsert_policy(policy_id: str, body: PolicyWrite, context: Context) -> PolicyRead:
    """Create or replace a policy. Rules are validated before they are stored."""
    for raw in body.rules:
        payload = dict(raw)
        payload.setdefault("name", body.name)
        parse_policy(payload)

    async with context.database.session() as session:
        repository = RoutingPolicyRepository(session)
        record = await repository.get(policy_id)
        if record is None:
            record = RoutingPolicyRecord(id=policy_id, name=body.name)
        record.name = body.name
        record.enabled = body.enabled
        record.priority = body.priority
        record.graph = dict(body.graph)
        record.rules = [dict(rule) for rule in body.rules]
        record.weights = dict(body.weights)
        await repository.save(record)
        return PolicyRead.from_record(record)


@router.get("/policies/{policy_id}", response_model=PolicyRead)
async def get_policy(policy_id: str, context: Context) -> PolicyRead:
    async with context.database.session() as session:
        record = await RoutingPolicyRepository(session).get(policy_id)
    if record is None:
        raise NotFound(f"Routing policy {policy_id!r} does not exist", policy_id=policy_id)
    return PolicyRead.from_record(record)


@router.get("/capabilities", response_model=list[str])
async def list_capabilities() -> list[str]:
    """The capability vocabulary, for the Add Model and Routing Studio UIs."""
    return [capability.value for capability in Capability]
