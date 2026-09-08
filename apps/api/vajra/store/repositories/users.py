"""User and Session persistence repositories."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import delete, func, select, update

from vajra.store.models import SessionRecord, UserRecord

from .base import Repository


class UserRepository(Repository):
    """Persistence operations for User accounts."""

    async def create(self, record: UserRecord) -> UserRecord:
        self.session.add(record)
        await self.session.flush()
        return record

    async def get(self, user_id: str) -> UserRecord | None:
        return await self.session.get(UserRecord, user_id)

    async def get_by_id(self, user_id: str) -> UserRecord | None:
        """Alias for get(user_id)."""
        return await self.get(user_id)

    async def get_by_username(self, username: str) -> UserRecord | None:
        statement = select(UserRecord).where(func.lower(UserRecord.username) == username.lower().strip())
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def save(self, record: UserRecord) -> None:
        self.session.add(record)
        await self.session.flush()

    async def list_all(self, *, limit: int = 100, offset: int = 0) -> list[UserRecord]:
        statement = (
            select(UserRecord)
            .order_by(UserRecord.created_at.asc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def count(self) -> int:
        statement = select(func.count()).select_from(UserRecord)
        result = await self.session.execute(statement)
        return int(result.scalar_one() or 0)


class SessionRepository(Repository):
    """Persistence operations for Server-Side Authentication Sessions."""

    async def create(self, record: SessionRecord) -> SessionRecord:
        self.session.add(record)
        await self.session.flush()
        return record

    async def get(self, session_id: str) -> SessionRecord | None:
        return await self.session.get(SessionRecord, session_id)

    async def get_by_token_hash(self, token_hash: str) -> SessionRecord | None:
        statement = select(SessionRecord).where(SessionRecord.token_hash == token_hash)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def save(self, record: SessionRecord) -> None:
        self.session.add(record)
        await self.session.flush()

    async def revoke(self, token_hash: str) -> None:
        statement = (
            update(SessionRecord)
            .where(SessionRecord.token_hash == token_hash)
            .values(revoked=True)
        )
        await self.session.execute(statement)
        await self.session.flush()

    async def revoke_all_for_user(self, user_id: str) -> None:
        statement = (
            update(SessionRecord)
            .where(SessionRecord.user_id == user_id, SessionRecord.revoked == False)  # noqa: E712
            .values(revoked=True)
        )
        await self.session.execute(statement)
        await self.session.flush()

    async def list_active_by_user(self, user_id: str, now: datetime) -> list[SessionRecord]:
        statement = (
            select(SessionRecord)
            .where(
                SessionRecord.user_id == user_id,
                SessionRecord.revoked == False,  # noqa: E712
                SessionRecord.expires_at > now,
            )
            .order_by(SessionRecord.last_seen_at.desc())
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def list_all_active(self, now: datetime) -> list[SessionRecord]:
        statement = (
            select(SessionRecord)
            .where(
                SessionRecord.revoked == False,  # noqa: E712
                SessionRecord.expires_at > now,
            )
            .order_by(SessionRecord.last_seen_at.desc())
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def delete_expired(self, now: datetime) -> int:
        statement = delete(SessionRecord).where(
            (SessionRecord.revoked == True) | (SessionRecord.expires_at <= now)  # noqa: E712
        )
        result = await self.session.execute(statement)
        await self.session.flush()
        return int(result.rowcount or 0)
