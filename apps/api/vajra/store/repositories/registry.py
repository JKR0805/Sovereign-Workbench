"""Runtime and model persistence."""

from __future__ import annotations

from sqlalchemy import select

from vajra.store.models import ModelRecord, RuntimeRecord

from .base import Repository


class RegistryRepository(Repository):
    # --- runtimes --------------------------------------------------------

    async def add_runtime(self, record: RuntimeRecord) -> RuntimeRecord:
        self.session.add(record)
        await self.session.flush()
        return record

    async def get_runtime(self, runtime_id: str) -> RuntimeRecord | None:
        return await self.session.get(RuntimeRecord, runtime_id)

    async def list_runtimes(self, *, enabled_only: bool = False) -> list[RuntimeRecord]:
        statement = select(RuntimeRecord)
        if enabled_only:
            statement = statement.where(RuntimeRecord.enabled == True)  # noqa: E712
        statement = statement.order_by(RuntimeRecord.id)
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    # --- models ----------------------------------------------------------

    async def add_model(self, record: ModelRecord) -> ModelRecord:
        self.session.add(record)
        await self.session.flush()
        return record

    async def get_model(self, model_id: str) -> ModelRecord | None:
        return await self.session.get(ModelRecord, model_id)

    async def list_models(
        self, *, enabled_only: bool = False, runtime_id: str | None = None
    ) -> list[ModelRecord]:
        statement = select(ModelRecord)
        if enabled_only:
            statement = statement.where(ModelRecord.enabled == True)  # noqa: E712
        if runtime_id is not None:
            statement = statement.where(ModelRecord.runtime_id == runtime_id)
        statement = statement.order_by(ModelRecord.priority.desc(), ModelRecord.id)
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def delete_model(self, record: ModelRecord) -> None:
        await self.session.delete(record)
        await self.session.flush()

    async def save(self, record: ModelRecord | RuntimeRecord) -> None:
        self.session.add(record)
        await self.session.flush()
