"""Server-Sent Events adapter.

Deliberately free of FastAPI: this module produces an ``AsyncIterator[str]`` of
wire-format SSE frames. The API layer wraps it in a ``StreamingResponse``. That
keeps the event system testable without an HTTP client and keeps the
dependency direction intact.

Frame contract::

    id: <seq>
    event: <EventType>
    data: <event JSON>

The ``id`` field is the sequence number, so a browser's ``EventSource`` sends
``Last-Event-ID`` on reconnect and the server resumes from exactly there
(equivalent to ``?since=<seq>``).
"""

from __future__ import annotations

import asyncio
import contextlib
import json
from collections.abc import AsyncIterator

from vajra.events.bus import EventBus
from vajra.events.models import Event

#: Sent when the stream is idle, to keep proxies from closing the connection.
KEEPALIVE_FRAME = ": keepalive\n\n"


def format_frame(event: Event) -> str:
    """Encode one event as an SSE frame."""
    data = json.dumps(event.to_wire(), separators=(",", ":"), default=str)
    return f"id: {event.seq}\nevent: {event.type.value}\ndata: {data}\n\n"


def format_comment(text: str) -> str:
    return f": {text}\n\n"


def format_control(name: str, payload: dict[str, object]) -> str:
    """A non-event control frame, e.g. to tell the client it lagged."""
    data = json.dumps(payload, separators=(",", ":"), default=str)
    return f"event: {name}\ndata: {data}\n\n"


async def stream_events(
    bus: EventBus,
    stream: str,
    *,
    since: int = 0,
    keepalive_s: float = 15.0,
    replay_batch: int = 500,
    terminal_types: frozenset[str] | None = None,
) -> AsyncIterator[str]:
    """Replay from ``since``, then follow live, as SSE frames.

    The subscription is attached *before* the replay read, so an event emitted
    during the replay is queued rather than lost. Any overlap is removed by
    filtering on ``seq``.

    ``terminal_types`` closes the stream once one of those event types is seen.
    The runs endpoint passes the run-terminal types so a finished run does not
    hold a connection open forever.
    """
    subscription = bus.subscribe(stream)
    async with subscription:
        last_seq = since

        backlog = await bus.replay(stream, since=since, limit=replay_batch)
        while backlog:
            for event in backlog:
                if event.seq <= last_seq:
                    continue
                last_seq = event.seq
                yield format_frame(event)
                if terminal_types and event.type.value in terminal_types:
                    return
            if len(backlog) < replay_batch:
                break
            backlog = await bus.replay(stream, since=last_seq, limit=replay_batch)

        while True:
            event = await subscription.get(timeout=keepalive_s)
            if event is None:
                yield KEEPALIVE_FRAME
                continue
            if subscription.lagged:
                # Tell the client to reconnect with ?since=<last_seq> and
                # backfill from the durable log rather than silently skipping.
                yield format_control(
                    "lagged", {"since": last_seq, "dropped": subscription.dropped}
                )
                subscription.lagged = False
            if event.seq <= last_seq:
                continue
            last_seq = event.seq
            yield format_frame(event)
            if terminal_types and event.type.value in terminal_types:
                return


async def collect(iterator: AsyncIterator[str], *, limit: int, timeout: float = 5.0) -> list[str]:
    """Drain up to ``limit`` frames. Test helper, not used by the application."""
    frames: list[str] = []

    async def _drain() -> None:
        async for frame in iterator:
            frames.append(frame)
            if len(frames) >= limit:
                return

    with contextlib.suppress(TimeoutError):
        await asyncio.wait_for(_drain(), timeout=timeout)
    return frames
