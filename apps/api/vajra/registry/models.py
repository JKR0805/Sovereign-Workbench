"""Registry data contracts.

The persisted shapes are :class:`~vajra.store.models.ModelRecord` and
:class:`~vajra.store.models.RuntimeRecord`. This module holds the contracts that
are *not* rows: registration input, probe reports, benchmark results and the read
models the API serialises.

Keeping the read model explicit rather than returning the table directly is what
lets the API guarantee that a measured field is ``null`` when it has never been
measured, instead of defaulting to a plausible number.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from vajra.core.enums import (
    Capability,
    ComputeDevice,
    HealthState,
    Modality,
    RuntimeKind,
    VerificationState,
)
from vajra.registry.capabilities import CapabilityProbeResult, normalise_capabilities
from vajra.store.models import ModelRecord, RuntimeRecord


class RuntimeRegistration(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    kind: RuntimeKind
    base_url: str
    enabled: bool = True


class RuntimeRead(BaseModel):
    id: str
    kind: RuntimeKind
    base_url: str
    enabled: bool
    health: HealthState
    health_detail: str | None
    version: str | None
    last_probe_at: datetime | None

    @classmethod
    def from_record(cls, record: RuntimeRecord) -> RuntimeRead:
        return cls(
            id=record.id,
            kind=record.kind,
            base_url=record.base_url,
            enabled=record.enabled,
            health=record.health,
            health_detail=record.health_detail,
            version=record.version,
            last_probe_at=record.last_probe_at,
        )


class ModelRegistration(BaseModel):
    """Declared model data. Everything here is configuration, not measurement."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=64)
    display_name: str
    runtime_id: str
    runtime_model_id: str
    capabilities: dict[str, float]
    context_window: int = Field(gt=0)
    max_output_tokens: int = Field(default=2048, gt=0)
    num_ctx: int | None = Field(default=None, gt=0)
    device: ComputeDevice = ComputeDevice.GPU
    vram_gb: float = Field(default=0.0, ge=0.0)
    quantization: str = "unknown"
    modalities_in: list[Modality] = Field(default_factory=lambda: [Modality.TEXT])
    priority: int = Field(default=50, ge=0, le=100)
    enabled: bool = True
    license: str = "unknown"

    @field_validator("capabilities")
    @classmethod
    def _validate_capabilities(cls, value: dict[str, float]) -> dict[str, float]:
        if not value:
            raise ValueError("A model must declare at least one capability")
        return normalise_capabilities(value)


class ModelUpdate(BaseModel):
    """Partial update. Only declared fields are settable; measured fields are not."""

    model_config = ConfigDict(extra="forbid")

    display_name: str | None = None
    capabilities: dict[str, float] | None = None
    context_window: int | None = Field(default=None, gt=0)
    max_output_tokens: int | None = Field(default=None, gt=0)
    num_ctx: int | None = Field(default=None, gt=0)
    device: ComputeDevice | None = None
    vram_gb: float | None = Field(default=None, ge=0.0)
    quantization: str | None = None
    modalities_in: list[Modality] | None = None
    priority: int | None = Field(default=None, ge=0, le=100)
    enabled: bool | None = None
    license: str | None = None

    @field_validator("capabilities")
    @classmethod
    def _validate_capabilities(cls, value: dict[str, float] | None) -> dict[str, float] | None:
        return None if value is None else normalise_capabilities(value)


class ModelMetrics(BaseModel):
    """Measured performance. ``None`` means "never measured", never zero."""

    avg_latency_ms: float | None = None
    tokens_per_sec: float | None = None
    measured_vram_gb: float | None = None
    request_count: int = 0
    error_count: int = 0

    @property
    def error_rate(self) -> float:
        return self.error_count / self.request_count if self.request_count else 0.0


class ModelRead(BaseModel):
    id: str
    display_name: str
    runtime_id: str
    runtime_model_id: str
    capabilities: dict[str, float]
    capabilities_verified: dict[str, VerificationState]
    context_window: int
    max_output_tokens: int
    num_ctx: int | None
    device: ComputeDevice
    vram_gb: float
    quantization: str
    modalities_in: list[str]
    priority: int
    enabled: bool
    license: str
    health: HealthState
    health_detail: str | None
    metrics: ModelMetrics
    last_probe_at: datetime | None
    last_used_at: datetime | None
    created_at: datetime

    @classmethod
    def from_record(cls, record: ModelRecord) -> ModelRead:
        verified = {
            key: VerificationState(value)
            for key, value in (record.capabilities_verified or {}).items()
        }
        return cls(
            id=record.id,
            display_name=record.display_name,
            runtime_id=record.runtime_id,
            runtime_model_id=record.runtime_model_id,
            capabilities=dict(record.capabilities or {}),
            capabilities_verified=verified,
            context_window=record.context_window,
            max_output_tokens=record.max_output_tokens,
            num_ctx=record.num_ctx,
            device=ComputeDevice(record.device),
            vram_gb=record.vram_gb,
            quantization=record.quantization,
            modalities_in=list(record.modalities_in or []),
            priority=record.priority,
            enabled=record.enabled,
            license=record.license,
            health=record.health,
            health_detail=record.health_detail,
            metrics=ModelMetrics(
                avg_latency_ms=record.avg_latency_ms,
                tokens_per_sec=record.tokens_per_sec,
                measured_vram_gb=record.measured_vram_gb,
                request_count=record.request_count,
                error_count=record.error_count,
            ),
            last_probe_at=record.last_probe_at,
            last_used_at=record.last_used_at,
            created_at=record.created_at,
        )


class ProbeStep(BaseModel):
    """One line of the Add Model checklist (Section N, screen 4)."""

    name: str
    passed: bool
    detail: str | None = None
    latency_ms: float | None = None


class ProbeReport(BaseModel):
    """Result of the registration probe chain.

    ``capabilities`` is empty when capability verification did not run. An empty
    list means "not verified", never "verified as absent".
    """

    runtime_id: str
    runtime_model_id: str
    runtime_reachable: bool
    model_present: bool
    steps: list[ProbeStep] = Field(default_factory=list)
    capabilities: list[CapabilityProbeResult] = Field(default_factory=list)
    runtime_metadata: dict[str, object] = Field(default_factory=dict)
    measured_vram_gb: float | None = None
    errors: list[str] = Field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.runtime_reachable and self.model_present and not self.errors


class BenchmarkResult(BaseModel):
    """Measured latency and throughput (Section E, probe chain step 4)."""

    model_id: str
    samples: int
    p50_latency_ms: float
    p95_latency_ms: float
    tokens_per_sec: float
    vram_delta_gb: float | None = None


class ResidencyEntry(BaseModel):
    """One model occupying VRAM right now, as reported by the runtime."""

    model_id: str | None
    runtime_model_id: str
    runtime_id: str
    vram_gb: float | None
    expires_at: datetime | None


class ResidencyReport(BaseModel):
    """Live residency, per runtime.

    ``unsupported_runtimes`` names runtimes that cannot report residency at all
    (see :class:`~vajra.runtimes.openai_compatible.OpenAICompatibleProvider`).
    They are listed rather than silently omitted, because "not reported" and
    "nothing resident" are different facts.
    """

    entries: list[ResidencyEntry] = Field(default_factory=list)
    unsupported_runtimes: list[str] = Field(default_factory=list)
    unreachable_runtimes: list[str] = Field(default_factory=list)

    @property
    def total_vram_gb(self) -> float | None:
        known = [entry.vram_gb for entry in self.entries if entry.vram_gb is not None]
        return sum(known) if known else None


class EvictionPlan(BaseModel):
    """What the residency planner intends to do to make room (Section E)."""

    target_model_id: str
    already_resident: bool
    evict: list[str] = Field(default_factory=list)
    reason: str


class CapabilityFilter(BaseModel):
    """Query filter for the Model Hub capability facet."""

    capability: Capability | None = None
    enabled_only: bool = False
