"""Conversation and message persistence."""

from __future__ import annotations

from sqlalchemy import delete, func, select

from vajra.store.models import ConversationRecord, MessageRecord, UserRecord

from .base import Repository


class ConversationRepository(Repository):
    # --- conversations -----------------------------------------------------

    async def create(self, record: ConversationRecord) -> ConversationRecord:
        self.session.add(record)
        await self.session.flush()
        return record

    async def get(self, conversation_id: str) -> ConversationRecord | None:
        return await self.session.get(ConversationRecord, conversation_id)

    async def get_with_username(
        self, conversation_id: str
    ) -> tuple[ConversationRecord, str | None] | None:
        statement = (
            select(ConversationRecord, UserRecord.username)
            .outerjoin(UserRecord, ConversationRecord.user_id == UserRecord.id)
            .where(ConversationRecord.id == conversation_id)
        )
        result = await self.session.execute(statement)
        row = result.first()
        if row is None:
            return None
        return (row[0], row[1])

    async def save(self, record: ConversationRecord) -> None:
        self.session.add(record)
        await self.session.flush()

    async def delete(self, record: ConversationRecord) -> None:
        """Removes messages first: the FK has no cascade and
        ``PRAGMA foreign_keys=ON`` is set, so the parent delete would otherwise
        fail. Runs are the audit trail and are intentionally left untouched."""
        await self.session.execute(
            delete(MessageRecord).where(MessageRecord.conversation_id == record.id)
        )
        await self.session.delete(record)
        await self.session.flush()

    async def list(
        self,
        *,
        user_id: str | None = None,
        project_id: str | None = None,
        archived: bool | None = False,
        limit: int = 50,
        offset: int = 0,
    ) -> list[ConversationRecord]:
        statement = select(ConversationRecord)
        if user_id is not None:
            statement = statement.where(ConversationRecord.user_id == user_id)
        if project_id is not None:
            statement = statement.where(ConversationRecord.project_id == project_id)
        if archived is not None:
            statement = statement.where(ConversationRecord.archived == archived)
        statement = (
            statement.order_by(
                ConversationRecord.pinned.desc(), ConversationRecord.updated_at.desc()
            )
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def list_with_usernames(
        self,
        *,
        user_id: str | None = None,
        project_id: str | None = None,
        archived: bool | None = False,
        limit: int = 50,
        offset: int = 0,
    ) -> list[tuple[ConversationRecord, str | None]]:
        statement = (
            select(ConversationRecord, UserRecord.username)
            .outerjoin(UserRecord, ConversationRecord.user_id == UserRecord.id)
        )
        if user_id is not None:
            statement = statement.where(ConversationRecord.user_id == user_id)
        if project_id is not None:
            statement = statement.where(ConversationRecord.project_id == project_id)
        if archived is not None:
            statement = statement.where(ConversationRecord.archived == archived)
        statement = (
            statement.order_by(
                ConversationRecord.pinned.desc(), ConversationRecord.updated_at.desc()
            )
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.execute(statement)
        return [(row[0], row[1]) for row in result.all()]

    async def count(
        self,
        *,
        user_id: str | None = None,
        project_id: str | None = None,
        archived: bool | None = False,
    ) -> int:
        statement = select(func.count()).select_from(ConversationRecord)
        if user_id is not None:
            statement = statement.where(ConversationRecord.user_id == user_id)
        if project_id is not None:
            statement = statement.where(ConversationRecord.project_id == project_id)
        if archived is not None:
            statement = statement.where(ConversationRecord.archived == archived)
        result = await self.session.execute(statement)
        return int(result.scalar_one())

    # --- messages ------------------------------------------------------

    async def next_ordinal(self, conversation_id: str) -> int:
        statement = select(func.coalesce(func.max(MessageRecord.ordinal), -1) + 1).where(
            MessageRecord.conversation_id == conversation_id
        )
        result = await self.session.execute(statement)
        return int(result.scalar_one())

    async def add_message(self, record: MessageRecord) -> MessageRecord:
        self.session.add(record)
        await self.session.flush()
        return record

    async def add_messages(self, records: list[MessageRecord]) -> list[MessageRecord]:
        self.session.add_all(records)
        await self.session.flush()
        return records

    async def save_message(self, record: MessageRecord) -> MessageRecord:
        merged = await self.session.merge(record)
        await self.session.flush()
        return merged

    async def get_message(self, message_id: str) -> MessageRecord | None:
        return await self.session.get(MessageRecord, message_id)

    async def list_messages(
        self,
        conversation_id: str,
        *,
        limit: int | None = None,
        before_ordinal: int | None = None,
    ) -> list[MessageRecord]:
        statement = select(MessageRecord).where(MessageRecord.conversation_id == conversation_id)
        if before_ordinal is not None:
            statement = statement.where(MessageRecord.ordinal < before_ordinal)
        statement = statement.order_by(MessageRecord.ordinal)
        if limit is not None:
            statement = statement.limit(limit)
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def tail_messages(self, conversation_id: str, *, limit: int) -> list[MessageRecord]:
        """The newest ``limit`` messages, returned oldest-first.

        Avoids loading an entire long conversation just to build a short
        history window for the next turn.
        """
        statement = (
            select(MessageRecord)
            .where(MessageRecord.conversation_id == conversation_id)
            .order_by(MessageRecord.ordinal.desc())
            .limit(limit)
        )
        result = await self.session.execute(statement)
        records = list(result.scalars().all())
        records.reverse()
        return records
