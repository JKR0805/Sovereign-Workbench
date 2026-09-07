"""Append-only event persistence.

The only write operation is :meth:`EventRepository.append`. There is no update
and no delete: the event log is the audit trail (Section D) and the run replay
source, and both properties depend on it being immutable.
"""

from __future__ import annotations

from sqlalchemy import func, select

from vajra.store.models import EventRecord

from .base import Repository


class EventRepository(Repository):
    async def append(self, record: EventRecord) -> EventRecord:
        self.session.add(record)
        await self.session.flush()
        return record

    async def max_seq(self, stream: str) -> int:
        """Highest allocated ``seq`` for a stream, or 0 when the stream is new."""
        statement = select(func.max(EventRecord.seq)).where(EventRecord.stream == stream)
        result = await self.session.execute(statement)
        value = result.scalar_one_or_none()
        return int(value) if value is not None else 0

    async def list_stream(
        self, stream: str, *, since: int = 0, limit: int | None = None
    ) -> list[EventRecord]:
        """Events for a stream with ``seq > since``, in sequence order.

        This is what backs ``GET /api/runs/{id}/events?since={seq}`` replay.
        """
        statement = (
            select(EventRecord)
            .where(EventRecord.stream == stream, EventRecord.seq > since)
            .order_by(EventRecord.seq)
        )
        if limit is not None:
            statement = statement.limit(limit)
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def query(
        self,
        *,
        run_id: str | None = None,
        event_type: str | None = None,
        limit: int = 200,
        offset: int = 0,
    ) -> list[EventRecord]:
        """Audit explorer query. Newest first."""
        statement = select(EventRecord)
        if run_id is not None:
            statement = statement.where(EventRecord.run_id == run_id)
        if event_type is not None:
            statement = statement.where(EventRecord.type == event_type)
        statement = statement.order_by(EventRecord.ts.desc()).limit(limit).offset(offset)
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def count(self, *, run_id: str | None = None) -> int:
        statement = select(func.count()).select_from(EventRecord)
        if run_id is not None:
            statement = statement.where(EventRecord.run_id == run_id)
        result = await self.session.execute(statement)
        return int(result.scalar_one())
