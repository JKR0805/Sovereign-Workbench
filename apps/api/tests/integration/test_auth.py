"""Integration tests for Authentication API endpoints."""

from __future__ import annotations

import httpx
import pytest


@pytest.mark.asyncio
async def test_login_success(async_client: httpx.AsyncClient):
    response = await async_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "sovereign2026", "remember_me": True},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["user"]["username"] == "admin"
    assert data["user"]["role"] == "admin"
    assert "token" in data
    assert "vajra_session" in response.cookies


@pytest.mark.asyncio
async def test_login_invalid_credentials(async_client: httpx.AsyncClient):
    response = await async_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "wrongpassword"},
    )
    assert response.status_code == 401
    assert response.json()["code"] == "unauthorized"


@pytest.mark.asyncio
async def test_me_authenticated(authenticated_client: httpx.AsyncClient):
    response = await authenticated_client.get("/api/auth/me")
    assert response.status_code == 200
    assert response.json()["username"] == "admin"


@pytest.mark.asyncio
async def test_me_unauthenticated(async_client: httpx.AsyncClient):
    response = await async_client.get("/api/auth/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_logout(authenticated_client: httpx.AsyncClient):
    # Verify logged in
    me_res = await authenticated_client.get("/api/auth/me")
    assert me_res.status_code == 200

    # Logout
    logout_res = await authenticated_client.post("/api/auth/logout")
    assert logout_res.status_code == 200

    # Verify session is revoked
    me_after = await authenticated_client.get("/api/auth/me")
    assert me_after.status_code == 401


@pytest.mark.asyncio
async def test_change_password(authenticated_client: httpx.AsyncClient):
    change_res = await authenticated_client.post(
        "/api/auth/change-password",
        json={"old_password": "sovereign2026", "new_password": "newpassword123"},
    )
    assert change_res.status_code == 200

    # Verify logging in with old password fails
    fail_res = await authenticated_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "sovereign2026"},
    )
    assert fail_res.status_code == 401

    # Verify logging in with new password succeeds
    succ_res = await authenticated_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "newpassword123"},
    )
    assert succ_res.status_code == 200
