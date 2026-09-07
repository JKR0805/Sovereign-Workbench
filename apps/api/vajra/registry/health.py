"""Probing: is the runtime up, is the model present, does it do what it claims.

Section E, "Adding a model without touching the router":

1. ``runtime.health()``
2. ``runtime.list_available()``
3. capability verification by real probe
4. latency benchmark

Steps 1 and 2 are implemented here and are genuinely real: they talk to the
runtime over HTTP and report what it says.

Steps 3 and 4 are **not implemented**. They require sending real generations
(a text prompt, a 32x32 test image, a tool-calling schema) and measuring the
results, and a probe that has not run must never report ``VERIFIED``. Rather than
fabricate a checklist, :meth:`ModelProber.probe` records those steps as not-run
and leaves every declared capability in state ``DECLARED``. See
``docs/RUNTIMES.md`` for where to implement them.
"""

from __future__ import annotations

from datetime import UTC, datetime

from vajra.core.enums import HealthState, VerificationState
from vajra.core.exceptions import NotImplementedYet, RuntimeAdapterError
from vajra.registry.models import BenchmarkResult, ProbeReport, ProbeStep
from vajra.runtimes.base import RuntimeAdapter


class ModelProber:
    """Runs the probe chain against a live runtime."""

    def __init__(self, adapter: RuntimeAdapter) -> None:
        self._adapter = adapter

    async def probe(self, runtime_model_id: str) -> ProbeReport:
        """Steps 1 and 2 of the chain, for real.

        Never raises for an unreachable runtime: an unreachable runtime is a
        *result*, and the Add Model wizard renders it as a failed checklist line.
        """
        report = ProbeReport(
            runtime_id=self._adapter.runtime_id,
            runtime_model_id=runtime_model_id,
            runtime_reachable=False,
            model_present=False,
        )

        health = await self._adapter.health()
        reachable = health.state is HealthState.HEALTHY
        report.runtime_reachable = reachable
        report.steps.append(
            ProbeStep(
                name="runtime_reachable",
                passed=reachable,
                detail=health.detail
                or (f"version {health.version}" if health.version else None),
                latency_ms=health.latency_ms,
            )
        )
        if not reachable:
            report.errors.append(
                health.detail or f"Runtime {self._adapter.runtime_id} is not reachable"
            )
            return report

        try:
            available = await self._adapter.list_available()
        except RuntimeAdapterError as exc:
            report.errors.append(str(exc.detail))
            report.steps.append(
                ProbeStep(name="model_present", passed=False, detail=str(exc.detail))
            )
            return report

        present_ids = {info.id for info in available}
        present = runtime_model_id in present_ids or any(
            info.id.split(":")[0] == runtime_model_id.split(":")[0] and info.id == runtime_model_id
            for info in available
        )
        report.model_present = present
        report.steps.append(
            ProbeStep(
                name="model_present",
                passed=present,
                detail=None
                if present
                else f"{runtime_model_id!r} is not present on this runtime",
            )
        )
        if not present:
            report.errors.append(
                f"{runtime_model_id!r} is not pulled on runtime {self._adapter.runtime_id!r}"
            )
            return report

        try:
            report.runtime_metadata = await self._adapter.show(runtime_model_id)
        except RuntimeAdapterError:
            # Metadata is a nicety; its absence is not a probe failure.
            report.runtime_metadata = {}

        # Steps 3 and 4 of the chain are not implemented. They are recorded as
        # not-run so the UI shows an honest "not verified" rather than a tick.
        report.steps.append(
            ProbeStep(
                name="capability_verification",
                passed=False,
                detail="not implemented: capabilities remain DECLARED until probed",
            )
        )
        report.steps.append(
            ProbeStep(
                name="latency_benchmark",
                passed=False,
                detail="not implemented: run POST /api/models/{id}/benchmark once available",
            )
        )
        return report

    async def benchmark(self, runtime_model_id: str, *, samples: int = 5) -> BenchmarkResult:
        """Measure p50/p95 latency, tokens/sec and VRAM delta.

        Not implemented. Implementing it means issuing ``samples`` real short
        generations through :meth:`RuntimeAdapter.chat`, timing them, and reading
        the VRAM delta from :meth:`RuntimeAdapter.resident` before and after.
        Every number it returns must come from those measurements.
        """
        raise NotImplementedYet(
            "Model benchmarking is not implemented. It must issue real generations and "
            "measure them; returning estimated latency or throughput would be fabricated data.",
            runtime_model_id=runtime_model_id,
            samples=samples,
        )

    async def verify_capabilities(
        self, runtime_model_id: str, declared: dict[str, float]
    ) -> dict[str, VerificationState]:
        """Prove or disprove each declared capability with a real probe.

        Not implemented. Until it is, every declared capability stays
        ``DECLARED``: the registry never claims verification it did not perform.
        """
        raise NotImplementedYet(
            "Capability verification is not implemented. Marking a capability VERIFIED "
            "without sending a probe would be a false claim about the model.",
            runtime_model_id=runtime_model_id,
            declared=sorted(declared),
        )


def initial_verification_state(declared: dict[str, float]) -> dict[str, str]:
    """Every capability starts ``DECLARED``: asserted by the operator, unproven."""
    return {capability: VerificationState.DECLARED.value for capability in declared}


def now() -> datetime:
    return datetime.now(UTC)
