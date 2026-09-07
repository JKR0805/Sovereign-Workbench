"""Routing policy persistence."""

from __future__ import annotations

from sqlalchemy import select

from vajra.store.models import RoutingPolicyRecord

from .base import Repository


class RoutingPolicyRepository(Repository):
    async def add(self, record: RoutingPolicyRecord) -> RoutingPolicyRecord:
        self.session.add(record)
        await self.session.flush()
        return record

    async def get(self, policy_id: str) -> RoutingPolicyRecord | None:
        return await self.session.get(RoutingPolicyRecord, policy_id)

    async def list(self, *, enabled_only: bool = False) -> list[RoutingPolicyRecord]:
        statement = select(RoutingPolicyRecord)
        if enabled_only:
            statement = statement.where(RoutingPolicyRecord.enabled == True)  # noqa: E712
        statement = statement.order_by(RoutingPolicyRecord.priority.desc())
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def save(self, record: RoutingPolicyRecord) -> None:
        self.session.add(record)
        await self.session.flush()
