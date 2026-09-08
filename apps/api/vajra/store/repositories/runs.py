"""Run, step, tool-call and artifact persistence."""

from __future__ import annotations

from sqlalchemy import func, select

from vajra.core.enums import RunStatus
from vajra.store.models import ArtifactRecord, RunRecord, RunStepRecord, ToolCallRecord

from .base import Repository


class RunRepository(Repository):
    async def create(self, record: RunRecord) -> RunRecord:
        self.session.add(record)
        await self.session.flush()
        return record

    async def get(self, run_id: str) -> RunRecord | None:
        return await self.session.get(RunRecord, run_id)

    async def save(self, record: RunRecord) -> None:
        self.session.add(record)
        await self.session.flush()

    async def list(
        self,
        *,
        user_id: str | None = None,
        status: RunStatus | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[RunRecord]:
        statement = select(RunRecord)
        if user_id is not None:
            statement = statement.where(RunRecord.user_id == user_id)
        if status is not None:
            statement = statement.where(RunRecord.status == status)
        statement = statement.order_by(RunRecord.created_at.desc()).limit(limit).offset(offset)
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def count(
        self, *, user_id: str | None = None, status: RunStatus | None = None
    ) -> int:
        statement = select(func.count()).select_from(RunRecord)
        if user_id is not None:
            statement = statement.where(RunRecord.user_id == user_id)
        if status is not None:
            statement = statement.where(RunRecord.status == status)
        result = await self.session.execute(statement)
        return int(result.scalar_one())

    # --- steps -----------------------------------------------------------

    async def add_step(self, record: RunStepRecord) -> RunStepRecord:
        self.session.add(record)
        await self.session.flush()
        return record

    async def save_step(self, record: RunStepRecord) -> RunStepRecord:
        merged = await self.session.merge(record)
        await self.session.flush()
        return merged

    async def list_steps(self, run_id: str) -> list[RunStepRecord]:
        statement = (
            select(RunStepRecord)
            .where(RunStepRecord.run_id == run_id)
            .order_by(RunStepRecord.ordinal)
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    # --- tool calls ------------------------------------------------------

    async def add_tool_call(self, record: ToolCallRecord) -> ToolCallRecord:
        self.session.add(record)
        await self.session.flush()
        return record

    async def list_tool_calls(self, run_id: str) -> list[ToolCallRecord]:
        statement = select(ToolCallRecord).where(ToolCallRecord.run_id == run_id)
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    # --- artifacts -------------------------------------------------------

    async def add_artifact(self, record: ArtifactRecord) -> ArtifactRecord:
        self.session.add(record)
        await self.session.flush()
        return record

    async def get_artifact(self, artifact_id: str) -> ArtifactRecord | None:
        return await self.session.get(ArtifactRecord, artifact_id)

    async def list_artifacts(self, run_id: str) -> list[ArtifactRecord]:
        statement = select(ArtifactRecord).where(ArtifactRecord.run_id == run_id)
        result = await self.session.execute(statement)
        return list(result.scalars().all())
