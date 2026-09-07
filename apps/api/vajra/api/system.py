"""System health (Section M: ``GET /api/system/health``).

Reports what it can measure and says so when it cannot. There is no GPU or VRAM
figure here yet, because nothing in this scaffold measures one and a plausible
number would be fabricated. The residency endpoint reports real VRAM from the
runtime; that is the honest source.
"""

from __future__ import annotations

import platform
import sys
from datetime import UTC, datetime

from fastapi import APIRouter
from pydantic import BaseModel, Field

from vajra import __version__
from vajra.core.dependencies import Context
from vajra.core.enums import HealthState
from vajra.store.database import journal_mode

router = APIRouter(prefix="/api/system", tags=["system"])


class ServiceHealth(BaseModel):
    name: str
    state: HealthState
    detail: str | None = None
    endpoint: str | None = None
    latency_ms: float | None = None


class SystemHealth(BaseModel):
    status: HealthState
    ts: datetime
    version: str
    profile: str
    python: str
    platform: str
    database_journal_mode: str
    services: list[ServiceHealth] = Field(default_factory=list)
    self_audit_passed: bool | None = None
    """``None`` when the self-audit is disabled: not run is not the same as passed."""


@router.get("/health", response_model=SystemHealth)
async def system_health(context: Context) -> SystemHealth:
    """Liveness plus the state of every dependency, measured now."""
    services: list[ServiceHealth] = []

    for health in (await context.runtimes.probe_all()).values():
        services.append(
            ServiceHealth(
                name=health.kind.value,
                state=health.state,
                detail=health.detail,
                endpoint=health.base_url,
                latency_ms=health.latency_ms,
            )
        )

    from vajra.rag.index import QdrantIndex

    qdrant = await QdrantIndex(context.settings.qdrant).health()
    services.append(
        ServiceHealth(
            name="qdrant",
            state=HealthState.HEALTHY if qdrant.available else HealthState.UNHEALTHY,
            detail=qdrant.detail,
            endpoint=qdrant.url,
        )
    )

    sandbox = context.sandbox.status()
    services.append(
        ServiceHealth(
            name="sandbox",
            state=HealthState.HEALTHY if sandbox.available else HealthState.UNHEALTHY,
            detail=sandbox.detail,
        )
    )

    # The API is healthy if it can serve; a degraded dependency degrades overall.
    degraded = any(service.state is not HealthState.HEALTHY for service in services)

    return SystemHealth(
        status=HealthState.DEGRADED if degraded else HealthState.HEALTHY,
        ts=datetime.now(UTC),
        version=__version__,
        profile=context.settings.profile.value,
        python=sys.version.split()[0],
        platform=f"{platform.system()} {platform.release()}",
        database_journal_mode=await journal_mode(context.database.engine),
        services=services,
        self_audit_passed=(
            context.self_audit.passed if context.self_audit is not None else None
        ),
    )


@router.get("/ping")
async def ping() -> dict[str, str]:
    """Cheap liveness probe that touches no dependency."""
    return {"status": "ok", "version": __version__}
