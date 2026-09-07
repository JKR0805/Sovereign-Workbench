"""The event bus: sequence allocation, durable append, async fanout.

Ordering guarantee: an event is persisted *before* it is delivered to any
subscriber. A client that reconnects with ``since=<last seq seen>`` can therefore
never miss an event it has already been shown, and can never be shown an event
that is not in the audit log.

Backpressure: each subscriber owns a bounded queue. A subscriber that cannot keep
up is marked ``lagged`` and further events are dropped *for that subscriber
only*. The SSE layer surfaces the lag so the client reconnects with ``since``
and backfills from the store. Blocking the producer on a slow browser tab would
stall the run, which is worse.

This module has no FastAPI import and no HTTP concept. It is usable from a
script, a test, or a worker.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections import deque
from collections.abc import AsyncIterator
from types import TracebackType

from vajra.events.models import Event, EventDraft
from vajra.events.store import EventStore
from vajra.events.types import GLOBAL_STREAM, EventType

logger = logging.getLogger(__name__)


class Subscription:
    """A live view of one stream.

    Obtained from :meth:`EventBus.subscribe`; always used as a context manager so
    the bus can drop the queue when the client goes away.
    """

    def __init__(self, bus: EventBus, stream: str, queue_size: int) -> None:
        self._bus = bus
        self.stream = stream
        self._queue: asyncio.Queue[Event] = asyncio.Queue(maxsize=queue_size)
        self.lagged = False
        self.dropped = 0

    def _offer(self, event: Event) -> None:
        """Non-blocking delivery. Called by the bus, never by a consumer."""
        try:
            self._queue.put_nowait(event)
        except asyncio.QueueFull:
            self.lagged = True
            self.dropped += 1

    async def __aenter__(self) -> Subscription:
        self._bus._attach(self)
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        self._bus._detach(self)

    async def get(self, timeout: float | None = None) -> Event | None:
        """Next event, or ``None`` when ``timeout`` elapses first."""
        if timeout is None:
            return await self._queue.get()
        try:
            return await asyncio.wait_for(self._queue.get(), timeout=timeout)
        except TimeoutError:
            return None

    def __aiter__(self) -> AsyncIterator[Event]:
        return self._iterate()

    async def _iterate(self) -> AsyncIterator[Event]:
        while True:
            yield await self._queue.get()


class EventBus:
    """Allocates sequence numbers, persists, and fans out."""

    def __init__(
        self,
        store: EventStore,
        *,
        subscriber_queue_size: int = 1024,
        ring_size: int = 256,
    ) -> None:
        self._store = store
        self._queue_size = subscriber_queue_size
        self._ring_size = ring_size
        self._subscribers: dict[str, set[Subscription]] = {}
        self._seq: dict[str, int] = {}
        self._locks: dict[str, asyncio.Lock] = {}
        self._recent: dict[str, deque[Event]] = {}

    # --- sequencing ------------------------------------------------------

    def _lock_for(self, stream: str) -> asyncio.Lock:
        lock = self._locks.get(stream)
        if lock is None:
            lock = asyncio.Lock()
            self._locks[stream] = lock
        return lock

    async def _next_seq(self, stream: str) -> int:
        """Allocate the next sequence number for a stream.

        The counter is seeded from the store the first time a stream is used, so
        an application restart continues the sequence rather than restarting it.
        """
        current = self._seq.get(stream)
        if current is None:
            current = await self._store.max_seq(stream)
        nxt = current + 1
        self._seq[stream] = nxt
        return nxt

    # --- emit ------------------------------------------------------------

    async def emit(self, draft: EventDraft) -> Event:
        """Sequence, persist, then fan out. Returns the durable event."""
        stream = draft.stream
        async with self._lock_for(stream):
            seq = await self._next_seq(stream)
            event = Event.from_draft(draft, seq)
            try:
                await self._store.append(event)
            except Exception:
                # Roll the counter back so the stream stays gap-free.
                self._seq[stream] = seq - 1
                raise
        self._record_recent(event)
        self._fanout(event)
        return event

    async def emit_event(
        self,
        event_type: EventType,
        *,
        run_id: str | None = None,
        node_id: str | None = None,
        duration_ms: float | None = None,
        **payload: object,
    ) -> Event:
        """Convenience wrapper for the common call shape."""
        return await self.emit(
            EventDraft(
                type=event_type,
                run_id=run_id,
                node_id=node_id,
                duration_ms=duration_ms,
                payload=dict(payload),
            )
        )

    def _record_recent(self, event: Event) -> None:
        ring = self._recent.get(event.stream)
        if ring is None:
            ring = deque(maxlen=self._ring_size)
            self._recent[event.stream] = ring
        ring.append(event)

    def _fanout(self, event: Event) -> None:
        for subscription in tuple(self._subscribers.get(event.stream, ())):
            subscription._offer(event)

    # --- subscription ----------------------------------------------------

    def subscribe(self, stream: str | None = None) -> Subscription:
        """Subscribe to a run's stream, or to the global stream when ``None``."""
        return Subscription(self, stream or GLOBAL_STREAM, self._queue_size)

    def _attach(self, subscription: Subscription) -> None:
        self._subscribers.setdefault(subscription.stream, set()).add(subscription)

    def _detach(self, subscription: Subscription) -> None:
        subscribers = self._subscribers.get(subscription.stream)
        if subscribers is None:
            return
        subscribers.discard(subscription)
        if not subscribers:
            self._subscribers.pop(subscription.stream, None)

    def subscriber_count(self, stream: str) -> int:
        return len(self._subscribers.get(stream, ()))

    # --- replay ----------------------------------------------------------

    async def replay(
        self, stream: str, *, since: int = 0, limit: int | None = None
    ) -> list[Event]:
        """Durable backfill. This is what ``?since=<seq>`` reads."""
        return await self._store.read(stream, since=since, limit=limit)

    def recent(self, stream: str) -> list[Event]:
        """In-memory tail, for diagnostics only. The store is authoritative."""
        return list(self._recent.get(stream, ()))

    async def close(self) -> None:
        """Drop every subscriber. Called on application shutdown."""
        for subscribers in self._subscribers.values():
            subscribers.clear()
        self._subscribers.clear()


@contextlib.asynccontextmanager
async def subscription(bus: EventBus, stream: str | None = None) -> AsyncIterator[Subscription]:
    """Small helper so callers do not have to remember the context manager."""
    sub = bus.subscribe(stream)
    async with sub:
        yield sub
