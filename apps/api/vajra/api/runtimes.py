"""Runtime endpoints (Section M)."""

from __future__ import annotations

from fastapi import APIRouter, status

from vajra.core.dependencies import Context
from vajra.core.exceptions import NotImplementedYet
from vajra.registry.models import RuntimeRead, RuntimeRegistration
from vajra.runtimes.base import RuntimeHealth, RuntimeModelInfo

router = APIRouter(prefix="/api/runtimes", tags=["runtimes"])


@router.get("", response_model=list[RuntimeRead])
async def list_runtimes(context: Context) -> list[RuntimeRead]:
    records = await context.runtimes.list()
    return [RuntimeRead.from_record(record) for record in records]


@router.post("", response_model=RuntimeRead, status_code=status.HTTP_201_CREATED)
async def register_runtime(
    registration: RuntimeRegistration, context: Context
) -> RuntimeRead:
    return RuntimeRead.from_record(await context.runtimes.register(registration))


@router.get("/{runtime_id}", response_model=RuntimeRead)
async def get_runtime(runtime_id: str, context: Context) -> RuntimeRead:
    return RuntimeRead.from_record(await context.runtimes.get(runtime_id))


@router.get("/{runtime_id}/available", response_model=list[RuntimeModelInfo])
async def list_available_models(runtime_id: str, context: Context) -> list[RuntimeModelInfo]:
    """Models the runtime already holds. Read from the runtime, live."""
    adapter = await context.runtimes.adapter(runtime_id)
    return await adapter.list_available()


@router.post("/{runtime_id}/probe", response_model=RuntimeHealth)
async def probe_runtime(runtime_id: str, context: Context) -> RuntimeHealth:
    """Measure runtime health now and persist the result."""
    return await context.runtimes.probe(runtime_id)


@router.post("/{runtime_id}/pull")
async def pull_model(runtime_id: str, context: Context) -> None:
    """Stream a model pull.

    Not implemented. It needs a streaming NDJSON proxy from the runtime's pull
    endpoint through SSE, with progress that reflects the real download.
    """
    await context.runtimes.get(runtime_id)
    raise NotImplementedYet(
        "Model pulling is not implemented. It must stream real progress from the "
        "runtime; a synthetic progress bar would misrepresent the download.",
        runtime_id=runtime_id,
    )
