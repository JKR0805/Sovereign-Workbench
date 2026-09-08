"""Authentication and user management service."""

from __future__ import annotations

import logging

from vajra.auth.passwords import (
    generate_temporary_password,
    hash_password,
    verify_password,
)
from vajra.auth.sessions import SessionService
from vajra.core.config import AuthSettings
from vajra.core.enums import UserRole
from vajra.core.exceptions import Conflict, NotFound, Unauthorized, ValidationError
from vajra.store.database import Database
from vajra.store.models import UserRecord, utcnow
from vajra.store.repositories.users import UserRepository

logger = logging.getLogger(__name__)


class AuthService:
    """Combines password verification, session management, and user lifecycle operations."""

    def __init__(
        self,
        database: Database,
        sessions: SessionService,
        settings: AuthSettings,
    ) -> None:
        self.database = database
        self.sessions = sessions
        self.settings = settings

    async def login(self, username: str, password: str) -> tuple[str, UserRecord]:
        """Authenticate user and issue a new session token.

        Raises Unauthorized on bad credentials or disabled account without disclosing
        whether the username exists.
        """
        if not username or not password:
            raise Unauthorized("Invalid username or password")

        async with self.database.session() as session:
            repo = UserRepository(session)
            user = await repo.get_by_username(username)

            if not user or not verify_password(password, user.password_hash):
                raise Unauthorized("Invalid username or password")

            if not user.enabled:
                raise Unauthorized("Account is disabled. Please contact your system administrator.")

            user.last_login_at = utcnow()
            await repo.save(user)

        raw_token, _ = await self.sessions.create(user.id)
        # Opportunistic background cleanup of expired sessions
        try:
            await self.sessions.cleanup_expired()
        except Exception:  # pragma: no cover
            logger.warning("Failed opportunistic session cleanup", exc_info=True)

        return raw_token, user

    async def logout(self, raw_token: str) -> None:
        """Revoke the current session token."""
        await self.sessions.revoke(raw_token)

    async def me(self, raw_token: str) -> UserRecord | None:
        """Authenticate and retrieve the user associated with the token."""
        return await self.sessions.authenticate(raw_token)

    async def create_user(
        self,
        *,
        username: str,
        role: UserRole = UserRole.USER,
        created_by: str | None = None,
        display_name: str | None = None,
        password: str | None = None,
    ) -> tuple[UserRecord, str]:
        """Create a new user account. Returns (user, initial_password)."""
        clean_username = username.strip()
        if not clean_username:
            raise ValidationError("Username cannot be empty")

        async with self.database.session() as session:
            repo = UserRepository(session)
            existing = await repo.get_by_username(clean_username)
            if existing:
                raise Conflict(f"User '{clean_username}' already exists")

            if password:
                initial_password = password
                must_change = False
            else:
                initial_password = generate_temporary_password(9)
                must_change = True

            pw_hash = hash_password(initial_password)
            user = UserRecord(
                username=clean_username,
                password_hash=pw_hash,
                role=role,
                display_name=display_name.strip() if display_name else clean_username,
                enabled=True,
                must_change_password=must_change,
                created_by=created_by,
            )
            created = await repo.create(user)
            return created, initial_password

    async def list_users(self, *, limit: int = 100, offset: int = 0) -> list[UserRecord]:
        """List all users in the system."""
        async with self.database.session() as session:
            repo = UserRepository(session)
            return await repo.list_all(limit=limit, offset=offset)

    async def get_user(self, user_id: str) -> UserRecord:
        """Retrieve user by ID or raise NotFound."""
        async with self.database.session() as session:
            repo = UserRepository(session)
            user = await repo.get(user_id)
            if not user:
                raise NotFound(f"User '{user_id}' not found")
            return user

    async def set_enabled(self, user_id: str, enabled: bool) -> UserRecord:
        """Enable or disable a user account. Disabling immediately revokes all user sessions."""
        async with self.database.session() as session:
            repo = UserRepository(session)
            user = await repo.get(user_id)
            if not user:
                raise NotFound(f"User '{user_id}' not found")

            user.enabled = enabled
            await repo.save(user)

        if not enabled:
            await self.sessions.revoke_all_for_user(user_id)

        return user

    async def reset_password(self, user_id: str) -> tuple[UserRecord, str]:
        """Generate a new temporary password and revoke existing sessions."""
        new_password = generate_temporary_password(9)
        async with self.database.session() as session:
            repo = UserRepository(session)
            user = await repo.get(user_id)
            if not user:
                raise NotFound(f"User '{user_id}' not found")

            user.password_hash = hash_password(new_password)
            user.must_change_password = True
            await repo.save(user)

        await self.sessions.revoke_all_for_user(user_id)
        return user, new_password

    async def change_password(
        self,
        user_id: str,
        *,
        old_password: str,
        new_password: str,
    ) -> UserRecord:
        """Change password by verifying the old password."""
        if len(new_password) < 6:
            raise ValidationError("New password must be at least 6 characters long")

        async with self.database.session() as session:
            repo = UserRepository(session)
            user = await repo.get(user_id)
            if not user:
                raise NotFound(f"User '{user_id}' not found")

            if not verify_password(old_password, user.password_hash):
                raise Unauthorized("Current password does not match")

            user.password_hash = hash_password(new_password)
            user.must_change_password = False
            await repo.save(user)
            return user

    async def bootstrap_admin(self) -> UserRecord | None:
        """Create initial admin account if users table is empty."""
        async with self.database.session() as session:
            repo = UserRepository(session)
            count = await repo.count()
            if count > 0:
                return None

            configured_pw = self.settings.bootstrap_admin_password
            if configured_pw:
                admin_pw = configured_pw
                must_change = False
            else:
                admin_pw = generate_temporary_password(12)
                must_change = True

            admin_user = UserRecord(
                username="admin",
                password_hash=hash_password(admin_pw),
                role=UserRole.ADMIN,
                display_name="Administrator",
                enabled=True,
                must_change_password=must_change,
            )
            created = await repo.create(admin_user)
            logger.info(
                "==========================================================\n"
                "BOOTSTRAP ADMIN CREATED:\n"
                "Username: admin\n"
                "Password: %s\n"
                "Must Change Password: %s\n"
                "==========================================================",
                admin_pw,
                must_change,
            )
            return created
