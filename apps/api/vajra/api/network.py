"""Sovereignty endpoints (Section M, "Sovereignty").

Everything here reports measured state. Where a layer cannot run in this
environment, the response says so explicitly: :class:`NftStatus` and
:class:`ConnectionSnapshot` both carry an ``available`` flag and a reason, and
counters are ``null`` rather than zero when they could not be read.

``POST /api/network/probe`` is the "Attempt External Call" button. It genuinely
attempts the configured external URL. The in-process guard blocks it, the attempt
is recorded, and the response reports what actually happened.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, Request
from fastapi.responses import PlainTextResponse, StreamingResponse
from pydantic import BaseModel

from vajra.core.dependencies import Context
from vajra.core.exceptions import SovereigntyViolation
from vajra.events.sse import stream_events
from vajra.events.types import GLOBAL_STREAM
from vajra.sentinel.ledger import NetworkEvent, SovereigntySnapshot
from vajra.sentinel.nft import NftStatus
from vajra.sovereignty.selfaudit import SelfAuditResult, run_self_audit

router = APIRouter(prefix="/api/network", tags=["network"])


class ProbeResult(BaseModel):
    """Outcome of a deliberate external-call attempt.

    ``blocked`` True with ``layer`` "app" is the expected result and is what the
    demo shows. ``blocked`` False means the attempt reached the network, which is
    a failure of the trust boundary and is reported as such.
    """

    target: str
    blocked: bool
    layer: str | None = None
    detail: str
    caller: str | None = None


@router.get("/snapshot", response_model=SovereigntySnapshot)
async def snapshot(context: Context) -> SovereigntySnapshot:
    """Live connection table, kernel counter and persisted block count."""
    return await context.ledger.snapshot()


@router.get("/events", response_model=list[NetworkEvent])
async def list_network_events(
    context: Context, limit: Annotated[int, Query(ge=1, le=1000)] = 100
) -> list[NetworkEvent]:
    return await context.ledger.events(limit=limit)


@router.get("/events/stream")
async def stream_network_events(
    request: Request,
    context: Context,
    since: Annotated[int, Query(ge=0)] = 0,
) -> StreamingResponse:
    """SSE ledger. Egress events live on the global stream, not on a run."""
    settings = context.settings.events
    generator = stream_events(
        context.events,
        GLOBAL_STREAM,
        since=since,
        keepalive_s=settings.sse_keepalive_s,
        replay_batch=settings.sse_replay_batch,
    )
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )


@router.get("/ruleset", response_class=PlainTextResponse)
async def ruleset(context: Context) -> PlainTextResponse:
    """``nft list ruleset``, verbatim, or the reason it is unavailable."""
    result = context.ledger.ruleset()
    text = getattr(result, "text", None)
    available = getattr(result, "available", False)
    if not available or text is None:
        return PlainTextResponse(
            f"# nftables ruleset unavailable: {getattr(result, 'detail', 'unknown')}\n",
            status_code=503,
        )
    return PlainTextResponse(text)


@router.get("/nft/status", response_model=NftStatus)
async def nft_status(context: Context) -> NftStatus:
    """Whether kernel-level enforcement is present on this host."""
    result = context.ledger.nft_status()
    assert isinstance(result, NftStatus)
    return result


@router.post("/probe", response_model=ProbeResult)
async def probe_external(context: Context) -> ProbeResult:
    """Deliberately attempt an external call, and report what happened.

    This is the twenty seconds that win the problem statement: the attempt is
    real, the block is real, and the ledger entry is written by the guard sink.
    """
    import httpx

    target = context.settings.sovereignty.probe_target_url
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(target)
    except SovereigntyViolation as exc:
        return ProbeResult(
            target=target,
            blocked=True,
            layer="app",
            detail=exc.detail,
            caller=str(exc.context.get("caller") or ""),
        )
    except httpx.HTTPError as exc:
        # The guard raises inside httpx's transport, which wraps it. Unwrap to
        # find out whether this was a block or a genuine network failure.
        cause = exc.__cause__ or exc.__context__
        while cause is not None and not isinstance(cause, SovereigntyViolation):
            cause = cause.__cause__ or cause.__context__
        if isinstance(cause, SovereigntyViolation):
            return ProbeResult(
                target=target,
                blocked=True,
                layer="app",
                detail=cause.detail,
                caller=str(cause.context.get("caller") or ""),
            )
        return ProbeResult(
            target=target,
            blocked=True,
            layer="transport",
            detail=(
                f"The request did not complete: {exc}. This is a transport failure, "
                "not a proof of policy enforcement."
            ),
        )

    return ProbeResult(
        target=target,
        blocked=False,
        detail=(
            f"The external call SUCCEEDED with HTTP {response.status_code}. "
            "The trust boundary did not hold."
        ),
    )


@router.get("/selfaudit", response_model=SelfAuditResult)
async def selfaudit(
    context: Context, refresh: Annotated[bool, Query()] = False
) -> SelfAuditResult:
    """Startup assertions and their results. ``refresh`` re-runs them now."""
    if refresh or context.self_audit is None:
        context.self_audit = run_self_audit(context.settings)
    return context.self_audit
