"""Authentication endpoints: login, logout, me, and change-password."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response, status

from vajra.auth.models import (
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    UserRead,
)
from vajra.core.dependencies import Context, CurrentUser

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
async def login(
    request_data: LoginRequest,
    response: Response,
    context: Context,
) -> LoginResponse:
    """Authenticate and create an HTTP session with cookie and returned token."""
    raw_token, user = await context.auth.login(request_data.username, request_data.password)

    cookie_name = context.settings.auth.cookie_name
    cookie_secure = context.settings.auth.cookie_secure
    # If remember_me is True, set Max-Age up to the 30-day absolute timeout.
    # If False, do not set max_age (browser session cookie).
    max_age = (
        context.settings.auth.session_absolute_timeout_s
        if request_data.remember_me
        else None
    )

    response.set_cookie(
        key=cookie_name,
        value=raw_token,
        max_age=max_age,
        httponly=True,
        secure=cookie_secure,
        samesite="lax",
        path="/",
    )

    return LoginResponse(
        user=UserRead.from_record(user),
        token=raw_token,
    )


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    context: Context,
) -> dict[str, bool]:
    """Revoke the current session and clear the session cookie."""
    cookie_name = context.settings.auth.cookie_name
    token = request.cookies.get(cookie_name)
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[len("Bearer ") :].strip()

    if token:
        await context.auth.logout(token)

    response.delete_cookie(
        key=cookie_name,
        path="/",
        httponly=True,
        samesite="lax",
    )
    return {"ok": True}


@router.get("/me", response_model=UserRead)
async def get_current_user_profile(
    user: CurrentUser,
) -> UserRead:
    """Return the profile of the currently authenticated user."""
    return UserRead.from_record(user)


@router.post("/change-password", response_model=UserRead)
async def change_password(
    request_data: ChangePasswordRequest,
    user: CurrentUser,
    context: Context,
) -> UserRead:
    """Change current user's password."""
    updated = await context.auth.change_password(
        user.id,
        old_password=request_data.old_password,
        new_password=request_data.new_password,
    )
    return UserRead.from_record(updated)
