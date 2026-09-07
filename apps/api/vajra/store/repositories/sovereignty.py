"""Network event and sovereignty snapshot persistence."""

from __future__ import annotations

from sqlalchemy import func, select

from vajra.core.enums import EgressVerdict
from vajra.store.models import NetworkEventRecord, SovereigntySnapshotRecord

from .base import Repository


class SovereigntyRepository(Repository):
    async def add_network_event(self, record: NetworkEventRecord) -> NetworkEventRecord:
        self.session.add(record)
        await self.session.flush()
        return record

    async def list_network_events(self, *, limit: int = 100) -> list[NetworkEventRecord]:
        statement = (
            select(NetworkEventRecord).order_by(NetworkEventRecord.ts.desc()).limit(limit)
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def count_blocked(self) -> int:
        """Number of persisted BLOCK verdicts. A real count, never a seeded value."""
        statement = (
            select(func.count())
            .select_from(NetworkEventRecord)
            .where(NetworkEventRecord.verdict == EgressVerdict.BLOCK)
        )
        result = await self.session.execute(statement)
        return int(result.scalar_one())

    async def add_snapshot(
        self, record: SovereigntySnapshotRecord
    ) -> SovereigntySnapshotRecord:
        self.session.add(record)
        await self.session.flush()
        return record

    async def latest_snapshot(self) -> SovereigntySnapshotRecord | None:
        statement = (
            select(SovereigntySnapshotRecord)
            .order_by(SovereigntySnapshotRecord.ts.desc())
            .limit(1)
        )
        result = await self.session.execute(statement)
        return result.scalars().first()
