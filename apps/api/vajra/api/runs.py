"""Run endpoints, including the SSE stream that is the primary channel.

User-scoped isolation and administrative oversight are enforced here.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Header, Query, Request, status
from fastapi.responses import StreamingResponse

from vajra.core.dependencies import Context, CurrentUser
from vajra.core.enums import RunStatus, UserRole
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
async def create_run(
    request: RunCreateRequest,
    user: CurrentUser,
    context: Context,
) -> RunCreated:
    """Create a run assigned to the authenticated user and start it."""
    return await context.orchestrator.create(request, user_id=user.id)


@router.get("", response_model=RunListPage)
async def list_runs(
    user: CurrentUser,
    context: Context,
    user_id: Annotated[str | None, Query()] = None,
    run_status: Annotated[RunStatus | None, Query(alias="status")] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> RunListPage:
    """List runs. Regular users only see their own; admin can inspect any or all."""
    target_user_id: str | None
    if user.role == UserRole.ADMIN:
        target_user_id = user_id
    else:
        target_user_id = user.id

    return await context.orchestrator.list(
        user_id=target_user_id, status=run_status, limit=limit, offset=offset
    )


@router.get("/{run_id}", response_model=RunRead)
async def get_run(
    run_id: str,
    user: CurrentUser,
    context: Context,
) -> RunRead:
    """Get run details, guarded by ownership."""
    return await context.orchestrator.get(run_id, user=user)


@router.get("/{run_id}/steps", response_model=list[RunStepRead])
async def get_run_steps(
    run_id: str,
    user: CurrentUser,
    context: Context,
) -> list[RunStepRead]:
    """Get run steps, guarded by ownership."""
    return await context.orchestrator.steps(run_id, user=user)


@router.get("/{run_id}/events")
async def stream_run_events(
    run_id: str,
    request: Request,
    user: CurrentUser,
    context: Context,
    since: Annotated[int, Query(ge=0)] = 0,
    last_event_id: Annotated[str | None, Header(alias="Last-Event-ID")] = None,
) -> StreamingResponse:
    """SSE stream for a run, guarded by ownership."""
    # Ensure current user is authorized before opening stream
    await context.orchestrator.get(run_id, user=user)

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
async def cancel_run(
    run_id: str,
    user: CurrentUser,
    context: Context,
) -> RunRead:
    """Cancel a run, guarded by ownership."""
    return await context.orchestrator.cancel(run_id, user=user)


@router.get("/{run_id}/artifacts")
async def list_run_artifacts(
    run_id: str,
    user: CurrentUser,
    context: Context,
) -> list[dict[str, object]]:
    """List artifacts for a run, guarded by ownership."""
    await context.orchestrator.get(run_id, user=user)
    artifacts = await context.artifacts.list_for_run(run_id)
    return [
        {
            "id": a.id,
            "filename": a.filename,
            "kind": a.kind.value,
            "size_bytes": a.size_bytes,
            "mime": a.mime,
            "sha256": a.sha256,
            "created_at": a.created_at.isoformat(),
        }
        for a in artifacts
    ]
