"""Run endpoints, including the SSE stream that is the primary channel.

``GET /api/runs/{id}/events`` is the only channel through which run state reaches
the UI (implementation rule 2). The endpoint replays from ``since`` and then
follows live, so a reconnect backfills exactly and a completed run replays
identically to a live one.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Header, Query, Request, status
from fastapi.responses import StreamingResponse

from vajra.core.dependencies import Context
from vajra.core.enums import RunStatus
from vajra.events.sse import stream_events
from vajra.orchestrator.models import (
    RunCreated,
    RunCreateRequest,
    RunListPage,
    RunRead,
    RunStepRead,
)
from vajra.orchestrator.service import TERMINAL_EVENT_TYPES

router = APIRouter(prefix="/api/runs", tags=["runs"])


@router.post("", response_model=RunCreated, status_code=status.HTTP_202_ACCEPTED)
async def create_run(request: RunCreateRequest, context: Context) -> RunCreated:
    """Create a run and start it. Returns immediately; the work streams."""
    return await context.orchestrator.create(request)


@router.get("", response_model=RunListPage)
async def list_runs(
    context: Context,
    run_status: Annotated[RunStatus | None, Query(alias="status")] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> RunListPage:
    return await context.orchestrator.list(status=run_status, limit=limit, offset=offset)


@router.get("/{run_id}", response_model=RunRead)
async def get_run(run_id: str, context: Context) -> RunRead:
    return await context.orchestrator.get(run_id)


@router.get("/{run_id}/steps", response_model=list[RunStepRead])
async def get_run_steps(run_id: str, context: Context) -> list[RunStepRead]:
    return await context.orchestrator.steps(run_id)


@router.get("/{run_id}/events")
async def stream_run_events(
    run_id: str,
    request: Request,
    context: Context,
    since: Annotated[int, Query(ge=0)] = 0,
    last_event_id: Annotated[str | None, Header(alias="Last-Event-ID")] = None,
) -> StreamingResponse:
    """SSE stream for a run.

    ``since`` wins when both are given; ``Last-Event-ID`` is what a browser's
    ``EventSource`` sends automatically on reconnect, so it is honoured too.
    Raises 404 for an unknown run rather than opening an empty stream.
    """
    await context.orchestrator.get(run_id)

    resume_from = since
    if resume_from == 0 and last_event_id and last_event_id.isdigit():
        resume_from = int(last_event_id)

    settings = context.settings.events
    generator = stream_events(
        context.events,
        run_id,
        since=resume_from,
        keepalive_s=settings.sse_keepalive_s,
        replay_batch=settings.sse_replay_batch,
        terminal_types=TERMINAL_EVENT_TYPES,
    )
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/{run_id}/cancel", response_model=RunRead)
async def cancel_run(run_id: str, context: Context) -> RunRead:
    return await context.orchestrator.cancel(run_id)


@router.get("/{run_id}/artifacts")
async def list_run_artifacts(run_id: str, context: Context) -> list[dict[str, object]]:
    await context.orchestrator.get(run_id)
    artifacts = await context.artifacts.list_for_run(run_id)
    return [artifact.model_dump(mode="json") for artifact in artifacts]
