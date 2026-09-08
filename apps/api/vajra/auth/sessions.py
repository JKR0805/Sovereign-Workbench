"""Server-side session management service.

Opaque 32-byte tokens, stored as SHA-256 hashes, with sliding 12h idle timeout,
30-day absolute cap, and instant revocation.
"""

from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import UTC, datetime, timedelta

from vajra.core.config import AuthSettings
from vajra.store.database import Database
from vajra.store.models import SessionRecord, UserRecord, utcnow
from vajra.store.repositories.users import SessionRepository, UserRepository

logger = logging.getLogger(__name__)


def _ensure_utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=UTC)


class SessionService:
    """Manages session lifecycle, verification, slide-expiration, and revocation."""

    def __init__(self, database: Database, settings: AuthSettings) -> None:
        self.database = database
        self.settings = settings

    def _hash_token(self, raw_token: str) -> str:
        return hashlib.sha256(raw_token.strip().encode("utf-8")).hexdigest()

    async def create(self, user_id: str) -> tuple[str, SessionRecord]:
        """Create a new session for a user. Returns (raw_token, session_record)."""
        raw_token = secrets.token_urlsafe(32)
        token_hash = self._hash_token(raw_token)

        now = utcnow()
        idle_delta = timedelta(seconds=self.settings.session_idle_timeout_s)
        expires_at = now + idle_delta

        record = SessionRecord(
            user_id=user_id,
            token_hash=token_hash,
            created_at=now,
            last_seen_at=now,
            expires_at=expires_at,
            revoked=False,
        )

        async with self.database.session() as session:
            repo = SessionRepository(session)
            await repo.create(record)

        return raw_token, record

    async def authenticate(self, raw_token: str) -> UserRecord | None:
        """Validate raw token against stored session and return user if active."""
        if not raw_token or not raw_token.strip():
            return None

        token_hash = self._hash_token(raw_token)
        now = utcnow()

        async with self.database.session() as session:
            session_repo = SessionRepository(session)
            user_repo = UserRepository(session)

            session_record = await session_repo.get_by_token_hash(token_hash)
            if not session_record or session_record.revoked:
                return None

            created_at = _ensure_utc(session_record.created_at)
            last_seen_at = _ensure_utc(session_record.last_seen_at)
            expires_at = _ensure_utc(session_record.expires_at)

            # Check absolute timeout (30 days cap)
            max_life = timedelta(seconds=self.settings.session_absolute_timeout_s)
            if (now - created_at) > max_life:
                await session_repo.revoke(token_hash)
                return None

            # Check idle timeout (12 hours)
            idle_timeout = timedelta(seconds=self.settings.session_idle_timeout_s)
            if (now - last_seen_at) > idle_timeout or now >= expires_at:
                await session_repo.revoke(token_hash)
                return None

            # Check user status
            user = await user_repo.get(session_record.user_id)
            if not user or not user.enabled:
                await session_repo.revoke(token_hash)
                return None

            # Slide expiration window up to absolute cap
            session_record.last_seen_at = now
            new_slide_expiry = now + idle_timeout
            absolute_expiry = created_at + max_life
            session_record.expires_at = min(new_slide_expiry, absolute_expiry)

            await session_repo.save(session_record)
            return user

    async def revoke(self, raw_token: str) -> None:
        """Revoke a single session token."""
        if not raw_token:
            return
        token_hash = self._hash_token(raw_token)
        async with self.database.session() as session:
            repo = SessionRepository(session)
            await repo.revoke(token_hash)

    async def revoke_all_for_user(self, user_id: str) -> None:
        """Revoke all active sessions for a user (on logout-all, password reset, or disable)."""
        async with self.database.session() as session:
            repo = SessionRepository(session)
            await repo.revoke_all_for_user(user_id)

    async def list_active(self, user_id: str | None = None) -> list[SessionRecord]:
        """List active sessions for a specific user, or across all users if user_id is None."""
        now = utcnow()
        async with self.database.session() as session:
            repo = SessionRepository(session)
            if user_id is not None:
                return await repo.list_active_by_user(user_id, now)
            return await repo.list_all_active(now)

    async def cleanup_expired(self) -> int:
        """Purge expired or revoked sessions from database."""
        now = utcnow()
        async with self.database.session() as session:
            repo = SessionRepository(session)
            return await repo.delete_expired(now)
