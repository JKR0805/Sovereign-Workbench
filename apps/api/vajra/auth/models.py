"""Pydantic schemas for authentication, user management, and session monitoring."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from vajra.core.enums import UserRole
from vajra.store.models import SessionRecord, UserRecord


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    username: str
    role: UserRole
    display_name: str | None = None
    enabled: bool
    must_change_password: bool
    created_at: datetime
    last_login_at: datetime | None = None

    @classmethod
    def from_record(cls, record: UserRecord) -> UserRead:
        return cls(
            id=record.id,
            username=record.username,
            role=record.role,
            display_name=record.display_name,
            enabled=record.enabled,
            must_change_password=record.must_change_password,
            created_at=record.created_at,
            last_login_at=record.last_login_at,
        )


class SessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    username: str | None = None
    created_at: datetime
    expires_at: datetime
    last_seen_at: datetime
    revoked: bool

    @classmethod
    def from_record(cls, record: SessionRecord, username: str | None = None) -> SessionRead:
        return cls(
            id=record.id,
            user_id=record.user_id,
            username=username,
            created_at=record.created_at,
            expires_at=record.expires_at,
            last_seen_at=record.last_seen_at,
            revoked=record.revoked,
        )


class LoginRequest(BaseModel):
    username: str
    password: str
    remember_me: bool = True


class LoginResponse(BaseModel):
    user: UserRead
    token: str


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


class CreateUserRequest(BaseModel):
    username: str
    role: UserRole = UserRole.USER
    display_name: str | None = None
    password: str | None = None


class CreateUserResponse(BaseModel):
    user: UserRead
    temporary_password: str


class UpdateUserRequest(BaseModel):
    display_name: str | None = None
    role: UserRole | None = None
    enabled: bool | None = None


class ResetPasswordResponse(BaseModel):
    user: UserRead
    temporary_password: str
