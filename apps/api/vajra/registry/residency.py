"""VRAM residency (Section E, "VRAM residency planner").

Two responsibilities:

:meth:`ResidencyService.report`
    Ask every runtime what currently occupies VRAM. Real data, read from the
    runtime. Runtimes that cannot answer are listed as unsupported rather than
    reported as empty.

:func:`plan_eviction`
    Decide what to evict to fit a target model. A pure function of measured
    inputs, so it is testable without a GPU.

Section V makes this the core scheduler rather than a nicety: with
``OLLAMA_MAX_LOADED_MODELS=1`` exactly one generative model is resident and every
route change is a swap the UI renders as a ``VRAM SCHEDULER`` node.
"""

from __future__ import annotations

from vajra.core.exceptions import AdapterCapabilityError, RuntimeAdapterError
from vajra.registry.models import EvictionPlan, ResidencyEntry, ResidencyReport
from vajra.registry.runtimes import RuntimeManager
from vajra.store.database import Database
from vajra.store.repositories.registry import RegistryRepository

_BYTES_PER_GB = 1024**3


def plan_eviction(
    *,
    target_model_id: str,
    target_vram_gb: float,
    resident: list[ResidencyEntry],
    total_vram_gb: float | None,
    max_loaded_models: int,
    last_used: dict[str, float] | None = None,
) -> EvictionPlan:
    """Decide which resident models must be evicted to fit the target.

    Eviction order is oldest ``last_used`` first, matching Section E. When
    ``total_vram_gb`` is unknown the planner still honours ``max_loaded_models``;
    it does not invent a VRAM total to reason about.
    """
    resident_ids = [entry.model_id or entry.runtime_model_id for entry in resident]
    if target_model_id in resident_ids:
        return EvictionPlan(
            target_model_id=target_model_id,
            already_resident=True,
            reason="target model is already resident",
        )

    last_used = last_used or {}
    ordered = sorted(resident, key=lambda e: last_used.get(e.model_id or "", 0.0))

    evict: list[str] = []
    remaining = list(ordered)

    # Slot constraint: honour the configured maximum number of loaded models.
    while len(remaining) + 1 > max_loaded_models and remaining:
        victim = remaining.pop(0)
        evict.append(victim.model_id or victim.runtime_model_id)

    if total_vram_gb is not None:
        used = sum(entry.vram_gb or 0.0 for entry in remaining)
        while remaining and used + target_vram_gb > total_vram_gb:
            victim = remaining.pop(0)
            evict.append(victim.model_id or victim.runtime_model_id)
            used -= victim.vram_gb or 0.0

    if not evict:
        reason = "sufficient capacity; no eviction required"
    elif total_vram_gb is None:
        reason = f"max_loaded_models={max_loaded_models} reached"
    else:
        reason = f"needs {target_vram_gb:.1f} GB of {total_vram_gb:.1f} GB"

    return EvictionPlan(
        target_model_id=target_model_id,
        already_resident=False,
        evict=evict,
        reason=reason,
    )


class ResidencyService:
    """Reads live residency from every reachable runtime."""

    def __init__(self, database: Database, runtimes: RuntimeManager) -> None:
        self._database = database
        self._runtimes = runtimes

    async def report(self) -> ResidencyReport:
        report = ResidencyReport()

        async with self._database.session() as session:
            models = await RegistryRepository(session).list_models()
            runtime_records = await RegistryRepository(session).list_runtimes(enabled_only=True)

        # runtime_model_id -> registered model id, so the UI can name what is loaded.
        by_runtime_model: dict[tuple[str, str], str] = {
            (model.runtime_id, model.runtime_model_id): model.id for model in models
        }

        for runtime_record in runtime_records:
            adapter = self._runtimes.adapter_for_record(runtime_record)
            try:
                resident = await adapter.resident()
            except AdapterCapabilityError:
                report.unsupported_runtimes.append(runtime_record.id)
                continue
            except RuntimeAdapterError:
                report.unreachable_runtimes.append(runtime_record.id)
                continue

            for entry in resident:
                report.entries.append(
                    ResidencyEntry(
                        model_id=by_runtime_model.get((runtime_record.id, entry.id)),
                        runtime_model_id=entry.id,
                        runtime_id=runtime_record.id,
                        vram_gb=(entry.vram_bytes / _BYTES_PER_GB)
                        if entry.vram_bytes is not None
                        else None,
                        expires_at=entry.expires_at,
                    )
                )
        return report

    async def resident_model_ids(self) -> set[str]:
        """Registered model ids currently in VRAM. Feeds the router's residency term."""
        report = await self.report()
        return {entry.model_id for entry in report.entries if entry.model_id is not None}
