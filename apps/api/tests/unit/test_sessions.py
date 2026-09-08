"""Unit tests for SessionService and UserRepository."""

from __future__ import annotations

import pytest

from vajra.auth.passwords import hash_password
from vajra.auth.sessions import SessionService
from vajra.core.config import AuthSettings
from vajra.core.enums import UserRole
from vajra.store.database import Database
from vajra.store.models import UserRecord
from vajra.store.repositories.users import UserRepository


@pytest.fixture
def auth_settings() -> AuthSettings:
    return AuthSettings(
        session_idle_timeout_s=3600,
        session_absolute_timeout_s=86400,
    )


@pytest.mark.asyncio
async def test_session_lifecycle(test_context, auth_settings: AuthSettings):
    database: Database = test_context.database
    session_service = SessionService(database, auth_settings)

    # 1. Create a user
    async with database.session() as s:
        user_repo = UserRepository(s)
        user = UserRecord(
            username="alice",
            password_hash=hash_password("alicepass"),
            role=UserRole.USER,
            display_name="Alice Liddell",
            enabled=True,
        )
        created_user = await user_repo.create(user)
        user_id = created_user.id

    # 2. Create session
    raw_token, session_record = await session_service.create(user_id)
    assert raw_token is not None
    assert len(raw_token) > 30
    assert session_record.user_id == user_id
    assert session_record.token_hash != raw_token

    # 3. Authenticate with raw token
    auth_user = await session_service.authenticate(raw_token)
    assert auth_user is not None
    assert auth_user.id == user_id
    assert auth_user.username == "alice"

    # 4. Authenticate with wrong token returns None
    assert await session_service.authenticate("bad_token_value") is None
    assert await session_service.authenticate("") is None

    # 5. Revoke session
    await session_service.revoke(raw_token)
    assert await session_service.authenticate(raw_token) is None


@pytest.mark.asyncio
async def test_session_disabled_user(test_context, auth_settings: AuthSettings):
    database: Database = test_context.database
    session_service = SessionService(database, auth_settings)

    async with database.session() as s:
        user_repo = UserRepository(s)
        user = await user_repo.create(
            UserRecord(
                username="bob",
                password_hash=hash_password("bobpass"),
                role=UserRole.USER,
                enabled=False,
            )
        )
        user_id = user.id

    raw_token, _ = await session_service.create(user_id)
    # Disabled user should fail authentication
    assert await session_service.authenticate(raw_token) is None


@pytest.mark.asyncio
async def test_revoke_all_for_user(test_context, auth_settings: AuthSettings):
    database: Database = test_context.database
    session_service = SessionService(database, auth_settings)

    async with database.session() as s:
        user_repo = UserRepository(s)
        user = await user_repo.create(
            UserRecord(
                username="carol",
                password_hash=hash_password("carolpass"),
                role=UserRole.USER,
                enabled=True,
            )
        )
        user_id = user.id

    token1, _ = await session_service.create(user_id)
    token2, _ = await session_service.create(user_id)

    assert await session_service.authenticate(token1) is not None
    assert await session_service.authenticate(token2) is not None

    await session_service.revoke_all_for_user(user_id)

    assert await session_service.authenticate(token1) is None
    assert await session_service.authenticate(token2) is None
