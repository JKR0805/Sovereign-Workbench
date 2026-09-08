"""Analytics endpoints (Section M, "Analytics").

Every number here is aggregated from the same durable tables the rest of the
application reads and writes -- ``runs``, ``events``, ``network_events``.
Nothing is estimated or seeded: a metric with no observations in the window
is ``0`` or ``null`` (never a plausible-looking placeholder), and the window
itself is always reported back so a chart never implies a time range it did
not actually query.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from sqlalchemy import select

from vajra.core.dependencies import Context
from vajra.core.enums import RunStatus
from vajra.store.models import EventRecord, NetworkEventRecord, RunRecord

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

AnalyticsWindow = Literal["24h", "7d", "30d", "all"]

_WINDOW_DELTAS: dict[str, timedelta | None] = {
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
    "all": None,
}


class AnalyticsSummary(BaseModel):
    window: AnalyticsWindow
    since: datetime | None
    total_runs: int
    completed_runs: int
    failed_runs: int
    cancelled_runs: int
    in_progress_runs: int
    p50_duration_ms: float | None
    p95_duration_ms: float | None
    total_tokens: int
    tokens_measured_runs: int
    model_usage: dict[str, int] = Field(default_factory=dict)
    retrieval_grounded_count: int
    retrieval_total_count: int
    egress_blocked_count: int
    egress_allowed_count: int


def _percentile(sorted_values: list[float], fraction: float) -> float | None:
    if not sorted_values:
        return None
    index = min(len(sorted_values) - 1, int(len(sorted_values) * fraction))
    return sorted_values[index]


@router.get("/summary", response_model=AnalyticsSummary)
async def analytics_summary(
    context: Context,
    window: Annotated[AnalyticsWindow, Query()] = "7d",
) -> AnalyticsSummary:
    delta = _WINDOW_DELTAS[window]
    since = datetime.now(UTC) - delta if delta is not None else None

    async with context.database.session() as session:
        run_statement = select(RunRecord)
        if since is not None:
            run_statement = run_statement.where(RunRecord.created_at >= since)
        runs = list((await session.execute(run_statement)).scalars().all())

        rag_statement = select(EventRecord).where(EventRecord.type == "RAG_RESULTS")
        if since is not None:
            rag_statement = rag_statement.where(EventRecord.ts >= since)
        rag_events = list((await session.execute(rag_statement)).scalars().all())

        network_statement = select(NetworkEventRecord)
        if since is not None:
            network_statement = network_statement.where(NetworkEventRecord.ts >= since)
        network_events = list((await session.execute(network_statement)).scalars().all())

    completed = [r for r in runs if r.status == RunStatus.COMPLETED]
    failed = [r for r in runs if r.status == RunStatus.FAILED]
    cancelled = [r for r in runs if r.status == RunStatus.CANCELLED]
    in_progress = [r for r in runs if r.status in (RunStatus.QUEUED, RunStatus.RUNNING)]

    durations = sorted(r.duration_ms for r in completed if r.duration_ms is not None)

    model_usage: dict[str, int] = {}
    for record in runs:
        for model_id in record.models_used or []:
            model_usage[model_id] = model_usage.get(model_id, 0) + 1

    grounded = sum(1 for e in rag_events if bool((e.payload or {}).get("grounded")))

    blocked = sum(1 for e in network_events if e.verdict.value == "block")
    allowed = sum(1 for e in network_events if e.verdict.value == "allow")

    return AnalyticsSummary(
        window=window,
        since=since,
        total_runs=len(runs),
        completed_runs=len(completed),
        failed_runs=len(failed),
        cancelled_runs=len(cancelled),
        in_progress_runs=len(in_progress),
        p50_duration_ms=_percentile(durations, 0.5),
        p95_duration_ms=_percentile(durations, 0.95),
        total_tokens=sum(r.total_tokens for r in runs),
        tokens_measured_runs=sum(1 for r in runs if r.total_tokens > 0),
        model_usage=model_usage,
        retrieval_grounded_count=grounded,
        retrieval_total_count=len(rag_events),
        egress_blocked_count=blocked,
        egress_allowed_count=allowed,
    )
