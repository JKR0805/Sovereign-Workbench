"""Registry records -> router candidates. The one place the conversion happens.

Moved here from ``vajra.api.routing`` so the run orchestrator can build the same
candidate fleet the Score Simulator does, without importing upward from
``vajra.api``. ``vajra.router.models.ModelCandidate`` documents the reason this
conversion is deliberately kept outside the router itself: "Building candidates
in the orchestrator rather than letting the router read the database is what
keeps the router a pure, testable function."

This module takes explicit dependencies (a registry, a runtime manager, a
residency service, a database) rather than the API layer's ``AppContext``, so it
sits legally at the ``orchestrator -> services`` layer and both ``vajra.api`` and
``vajra.orchestrator`` may import it.
"""

from __future__ import annotations

from urllib.parse import urlparse

from vajra.core.enums import Modality, RuntimeKind
from vajra.registry.capabilities import SERVICE_CAPABILITIES, parse_capability
from vajra.registry.residency import ResidencyService
from vajra.registry.runtimes import RuntimeManager
from vajra.registry.service import ModelRegistry
from vajra.router.models import ModelCandidate, RoutingContext
from vajra.router.policy import RoutingPolicy, parse_policy
from vajra.store.database import Database
from vajra.store.models import ModelRecord
from vajra.store.repositories.policies import RoutingPolicyRepository

LOOPBACK_HOSTS: frozenset[str] = frozenset({"127.0.0.1", "localhost", "::1"})


def host_is_loopback(base_url: str) -> bool:
    return (urlparse(base_url).hostname or "") in LOOPBACK_HOSTS


def parse_modalities(values: list[str] | None) -> set[Modality]:
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
    modalities = frozenset(parse_modalities(record.modalities_in))
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


def is_service_model(record: ModelRecord) -> bool:
    """True when every capability the record declares is a service capability.

    Replaces the dead ``getattr(m, "role", "") != "embedding"`` check that used
    to live in the run executor: ``ModelRecord`` has no ``role`` column, so that
    check was a permanent no-op. Declared capabilities are data the router
    already understands and are probe-verifiable, so they are the correct signal
    for "this is an embedding/reranking service, not a chat candidate" and need
    no schema change.

    A record declaring no capabilities at all is not a service model: an
    undeclared model is unknown, not excluded.
    """
    if not record.capabilities:
        return False
    declared = {parse_capability(key) for key in record.capabilities}
    return declared.issubset(SERVICE_CAPABILITIES)


async def build_candidates(
    *,
    registry: ModelRegistry,
    runtimes: RuntimeManager,
    residency: ResidencyService | None = None,
    exclude_service_models: bool = True,
) -> tuple[list[ModelCandidate], RoutingContext]:
    """Assemble the candidate fleet and the hardware context from live state.

    Residency is read from the runtimes. When no runtime can report it, the set
    is empty and every candidate scores as non-resident, which is honest: we do
    not know that anything is loaded. ``residency=None`` is treated the same way
    -- an unavailable reporter, not "nothing resident".
    """
    records = await registry.list()
    runtime_records = {runtime.id: runtime for runtime in await runtimes.list()}

    resident_ids: set[str] = set()
    if residency is not None:
        try:
            resident_ids = await residency.resident_model_ids()
        except Exception:
            resident_ids = set()

    candidates: list[ModelCandidate] = []
    for record in records:
        if exclude_service_models and is_service_model(record):
            continue
        runtime = runtime_records.get(record.runtime_id)
        if runtime is None:
            continue
        candidates.append(
            to_candidate(
                record,
                runtime_kind=runtime.kind,
                host_is_loopback=host_is_loopback(runtime.base_url),
                resident=record.id in resident_ids,
            )
        )

    return candidates, RoutingContext(resident_model_ids=frozenset(resident_ids))


async def load_policies(database: Database) -> list[RoutingPolicy]:
    """Load enabled policies from the database, validating each rule."""
    async with database.session() as session:
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


__all__ = [
    "LOOPBACK_HOSTS",
    "build_candidates",
    "host_is_loopback",
    "is_service_model",
    "load_policies",
    "parse_modalities",
    "to_candidate",
]
