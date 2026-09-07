"""Model registry endpoints (Section M, "Models & runtimes")."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, status
from pydantic import BaseModel

from vajra.core.dependencies import Context
from vajra.core.enums import Capability
from vajra.registry.health import ModelProber
from vajra.registry.models import (
    BenchmarkResult,
    ModelRead,
    ModelRegistration,
    ModelUpdate,
    ProbeReport,
    ResidencyReport,
)

router = APIRouter(prefix="/api/models", tags=["models"])


class ProbeRequest(BaseModel):
    """``POST /api/models/probe``: test a record before saving it."""

    runtime_id: str
    runtime_model_id: str


@router.get("", response_model=list[ModelRead])
async def list_models(
    context: Context,
    capability: Annotated[Capability | None, Query()] = None,
    enabled_only: Annotated[bool, Query()] = False,
) -> list[ModelRead]:
    """List registered models, optionally faceted by capability."""
    records = await context.registry.list(enabled_only=enabled_only)
    reads = [ModelRead.from_record(record) for record in records]
    if capability is not None:
        reads = [read for read in reads if capability.value in read.capabilities]
    return reads


@router.post("", response_model=ModelRead, status_code=status.HTTP_201_CREATED)
async def register_model(
    registration: ModelRegistration,
    context: Context,
    probe: Annotated[bool, Query()] = True,
) -> ModelRead:
    """Register a model. Probing is real and its result is stored as health."""
    record = await context.registry.register(registration, probe=probe)
    return ModelRead.from_record(record)


@router.post("/probe", response_model=ProbeReport)
async def probe_model(request: ProbeRequest, context: Context) -> ProbeReport:
    """Run the probe chain without saving anything."""
    return await context.registry.probe(request.runtime_id, request.runtime_model_id)


@router.get("/residency", response_model=ResidencyReport)
async def model_residency(context: Context) -> ResidencyReport:
    """Which models occupy VRAM right now, read from each runtime."""
    return await context.residency.report()


@router.get("/{model_id}", response_model=ModelRead)
async def get_model(model_id: str, context: Context) -> ModelRead:
    return ModelRead.from_record(await context.registry.get(model_id))


@router.patch("/{model_id}", response_model=ModelRead)
async def update_model(model_id: str, update: ModelUpdate, context: Context) -> ModelRead:
    """Mutations return the full updated resource (Section M, conventions)."""
    return ModelRead.from_record(await context.registry.update(model_id, update))


@router.delete("/{model_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_model(model_id: str, context: Context) -> None:
    await context.registry.delete(model_id)


@router.post("/{model_id}/refresh", response_model=ModelRead)
async def refresh_model_health(model_id: str, context: Context) -> ModelRead:
    """Re-probe a registered model and persist the measured health."""
    return ModelRead.from_record(await context.registry.refresh_health(model_id))


@router.post("/{model_id}/benchmark", response_model=BenchmarkResult)
async def benchmark_model(model_id: str, context: Context) -> BenchmarkResult:
    """Measure latency, throughput and VRAM delta.

    Not implemented: it raises 501. Reporting an estimated tok/s would be a
    fabricated measurement, which is exactly what the Model Hub must not show.
    """
    record = await context.registry.get(model_id)
    adapter = await context.runtimes.adapter(record.runtime_id)
    return await ModelProber(adapter).benchmark(record.runtime_model_id)


@router.post("/{model_id}/load", status_code=status.HTTP_204_NO_CONTENT)
async def load_model(model_id: str, context: Context) -> None:
    """Bring a model into VRAM. 501 on runtimes that pin their model at start."""
    await context.registry.load(model_id)


@router.post("/{model_id}/unload", status_code=status.HTTP_204_NO_CONTENT)
async def unload_model(model_id: str, context: Context) -> None:
    await context.registry.unload(model_id)
