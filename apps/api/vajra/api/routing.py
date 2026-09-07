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

from urllib.parse import urlparse

from fastapi import APIRouter
from pydantic import BaseModel, Field

from vajra.core.dependencies import AppContext, Context
from vajra.core.enums import Capability, Modality, RuntimeKind
from vajra.core.exceptions import NotFound
from vajra.registry.capabilities import parse_capability
from vajra.router.classify import Attachment
from vajra.router.models import (
    ModelCandidate,
    RoutingContext,
    RoutingDecision,
    ScoringWeights,
    TaskSpec,
)
from vajra.router.policy import RoutingPolicy, parse_policy
from vajra.store.models import ModelRecord, RoutingPolicyRecord
from vajra.store.repositories.policies import RoutingPolicyRepository

router = APIRouter(prefix="/api/routing", tags=["routing"])

_LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}


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


def _host_is_loopback(base_url: str) -> bool:
    return (urlparse(base_url).hostname or "") in _LOOPBACK_HOSTS


def _parse_modalities(values: list[str] | None) -> set[Modality]:
    """Coerce stored modality strings, defaulting to text.

    An unrecognised stored value is dropped rather than raised on: a bad row must
    not make the whole fleet unroutable.
    """
    modalities: set[Modality] = set()
    for value in values or []:
        try:
            modalities.add(Modality(value))
        except ValueError:
            continue
    return modalities or {Modality.TEXT}


def to_candidate(
    record: ModelRecord,
    *,
    runtime_kind: RuntimeKind,
    host_is_loopback: bool,
    resident: bool,
) -> ModelCandidate:
    """Project a registry record onto what the router is allowed to see."""
    capabilities = {
        parse_capability(key): float(value) for key, value in (record.capabilities or {}).items()
    }
    verified = frozenset(
        parse_capability(key)
        for key, value in (record.capabilities_verified or {}).items()
        if value == "verified"
    )
    modalities = frozenset(_parse_modalities(record.modalities_in))
    return ModelCandidate(
        model_id=record.id,
        runtime_id=record.runtime_id,
        runtime_kind=runtime_kind,
        capabilities=capabilities,
        verified_capabilities=verified,
        modalities_in=modalities,
        context_window=record.context_window,
        effective_context=record.num_ctx,
        vram_gb=record.vram_gb,
        priority=record.priority,
        enabled=record.enabled,
        health=record.health,
        resident=resident,
        host_is_loopback=host_is_loopback,
        avg_latency_ms=record.avg_latency_ms,
        request_count=record.request_count,
        error_count=record.error_count,
    )


async def build_candidates(context: AppContext) -> tuple[list[ModelCandidate], RoutingContext]:
    """Assemble the candidate fleet and the hardware context from live state.

    Residency is read from the runtimes. When no runtime can report it, the set
    is empty and every candidate scores as non-resident, which is honest: we do
    not know that anything is loaded.
    """
    records = await context.registry.list()
    runtimes = {runtime.id: runtime for runtime in await context.runtimes.list()}

    try:
        resident_ids = await context.residency.resident_model_ids()
    except Exception:
        resident_ids = set()

    candidates: list[ModelCandidate] = []
    for record in records:
        runtime = runtimes.get(record.runtime_id)
        if runtime is None:
            continue
        candidates.append(
            to_candidate(
                record,
                runtime_kind=runtime.kind,
                host_is_loopback=_host_is_loopback(runtime.base_url),
                resident=record.id in resident_ids,
            )
        )

    return candidates, RoutingContext(resident_model_ids=frozenset(resident_ids))


async def load_policies(context: AppContext) -> list[RoutingPolicy]:
    """Load enabled policies from the database, validating each rule."""
    async with context.database.session() as session:
        records = await RoutingPolicyRepository(session).list(enabled_only=True)

    policies: list[RoutingPolicy] = []
    for record in records:
        for raw in record.rules or []:
            payload = dict(raw)
            payload.setdefault("name", record.name)
            payload.setdefault("priority", record.priority)
            if record.weights:
                payload.setdefault("weights", record.weights)
            policies.append(parse_policy(payload))
    return policies


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
