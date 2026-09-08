"""Admin endpoints for user management and session oversight."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from vajra.auth.models import (
    CreateUserRequest,
    CreateUserResponse,
    ResetPasswordResponse,
    SessionRead,
    UpdateUserRequest,
    UserRead,
)
from vajra.core.dependencies import AdminUser, Context
from vajra.store.repositories.users import UserRepository

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/users", response_model=list[UserRead])
async def list_users(
    admin: AdminUser,
    context: Context,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[UserRead]:
    """List all registered users (Admin only)."""
    users = await context.auth.list_users(limit=limit, offset=offset)
    return [UserRead.from_record(u) for u in users]


@router.post("/users", response_model=CreateUserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    request_data: CreateUserRequest,
    admin: AdminUser,
    context: Context,
) -> CreateUserResponse:
    """Create a new user account with a temporary password (Admin only)."""
    user, temp_pw = await context.auth.create_user(
        username=request_data.username,
        role=request_data.role,
        created_by=admin.id,
        display_name=request_data.display_name,
        password=request_data.password,
    )
    return CreateUserResponse(
        user=UserRead.from_record(user),
        temporary_password=temp_pw,
    )


@router.patch("/users/{user_id}", response_model=UserRead)
async def update_user(
    user_id: str,
    request_data: UpdateUserRequest,
    admin: AdminUser,
    context: Context,
) -> UserRead:
    """Update user role, display name, or enabled status (Admin only)."""
    user = await context.auth.get_user(user_id)

    async with context.database.session() as session:
        repo = UserRepository(session)
        if request_data.display_name is not None:
            user.display_name = request_data.display_name
        if request_data.role is not None:
            user.role = request_data.role
        await repo.save(user)

    if request_data.enabled is not None and request_data.enabled != user.enabled:
        user = await context.auth.set_enabled(user_id, request_data.enabled)

    return UserRead.from_record(user)


@router.post("/users/{user_id}/reset-password", response_model=ResetPasswordResponse)
async def reset_password(
    user_id: str,
    admin: AdminUser,
    context: Context,
) -> ResetPasswordResponse:
    """Reset user password to a one-time credential and invalidate existing sessions (Admin only)."""
    user, temp_pw = await context.auth.reset_password(user_id)
    return ResetPasswordResponse(
        user=UserRead.from_record(user),
        temporary_password=temp_pw,
    )


@router.get("/sessions", response_model=list[SessionRead])
async def list_active_sessions(
    admin: AdminUser,
    context: Context,
) -> list[SessionRead]:
    """List all real active sessions across the system (Admin only)."""
    sessions = await context.sessions.list_active()
    # Build username lookup
    async with context.database.session() as s:
        repo = UserRepository(s)
        users = await repo.list_all(limit=500)
        username_map = {u.id: u.username for u in users}

    return [
        SessionRead.from_record(s, username=username_map.get(s.user_id, "unknown"))
        for s in sessions
    ]
