"""Event persistence behind a protocol.

Two implementations ship:

:class:`SqlEventStore`
    Production. Writes to the ``events`` table through
    :class:`~vajra.store.repositories.events.EventRepository`.

:class:`InMemoryEventStore`
    **Test implementation.** Used by unit tests that exercise the bus without a
    database. It is not wired into the application and must never be.
"""

from __future__ import annotations

import asyncio
from typing import Protocol

from vajra.events.models import Event
from vajra.store.database import Database
from vajra.store.models import EventRecord
from vajra.store.repositories.events import EventRepository


class EventStore(Protocol):
    """Append-only from the application's point of view."""

    async def append(self, event: Event) -> None:
        """Persist one event. Must be durable before the bus fans it out."""
        ...

    async def max_seq(self, stream: str) -> int:
        """Highest sequence number already allocated on a stream, or 0."""
        ...

    async def read(self, stream: str, *, since: int = 0, limit: int | None = None) -> list[Event]:
        """Events with ``seq > since``, ordered by ``seq``."""
        ...


def _record_to_event(record: EventRecord) -> Event:
    from vajra.events.types import EventType

    return Event(
        id=record.id,
        seq=record.seq,
        stream=record.stream,
        run_id=record.run_id,
        ts=record.ts,
        type=EventType(record.type),
        node_id=record.node_id,
        payload=dict(record.payload or {}),
        duration_ms=record.duration_ms,
    )


def _event_to_record(event: Event) -> EventRecord:
    return EventRecord(
        id=event.id,
        stream=event.stream,
        seq=event.seq,
        run_id=event.run_id,
        ts=event.ts,
        type=event.type.value,
        node_id=event.node_id,
        payload=dict(event.payload),
        duration_ms=event.duration_ms,
    )


class SqlEventStore:
    """Production event store. One short transaction per append."""

    def __init__(self, database: Database) -> None:
        self._database = database

    async def append(self, event: Event) -> None:
        async with self._database.session() as session:
            await EventRepository(session).append(_event_to_record(event))

    async def max_seq(self, stream: str) -> int:
        async with self._database.session() as session:
            return await EventRepository(session).max_seq(stream)

    async def read(self, stream: str, *, since: int = 0, limit: int | None = None) -> list[Event]:
        async with self._database.session() as session:
            records = await EventRepository(session).list_stream(stream, since=since, limit=limit)
            return [_record_to_event(record) for record in records]


class InMemoryEventStore:
    """Test implementation. Not for production use."""

    def __init__(self) -> None:
        self._events: dict[str, list[Event]] = {}
        self._lock = asyncio.Lock()

    async def append(self, event: Event) -> None:
        async with self._lock:
            self._events.setdefault(event.stream, []).append(event)

    async def max_seq(self, stream: str) -> int:
        async with self._lock:
            events = self._events.get(stream, [])
            return events[-1].seq if events else 0

    async def read(self, stream: str, *, since: int = 0, limit: int | None = None) -> list[Event]:
        async with self._lock:
            selected = [e for e in self._events.get(stream, []) if e.seq > since]
        selected.sort(key=lambda e: e.seq)
        return selected[:limit] if limit is not None else selected
