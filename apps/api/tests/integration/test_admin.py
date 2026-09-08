"""Integration tests for Admin API endpoints and RBAC."""

from __future__ import annotations

import httpx
import pytest


@pytest.mark.asyncio
async def test_admin_create_and_list_users(authenticated_client: httpx.AsyncClient):
    # 1. Create a regular user
    create_res = await authenticated_client.post(
        "/api/admin/users",
        json={
            "username": "engineer1",
            "role": "user",
            "display_name": "Chief Engineer",
        },
    )
    assert create_res.status_code == 201
    created_data = create_res.json()
    assert created_data["user"]["username"] == "engineer1"
    assert created_data["user"]["role"] == "user"
    assert "temporary_password" in created_data
    temp_pw = created_data["temporary_password"]

    # 2. List users
    list_res = await authenticated_client.get("/api/admin/users")
    assert list_res.status_code == 200
    users = list_res.json()
    assert any(u["username"] == "engineer1" for u in users)

    # 3. New user can log in with temporary password
    transport = authenticated_client._transport
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as user_client:
        login_res = await user_client.post(
            "/api/auth/login",
            json={"username": "engineer1", "password": temp_pw},
        )
        assert login_res.status_code == 200
        assert login_res.json()["user"]["username"] == "engineer1"


@pytest.mark.asyncio
async def test_admin_disable_user(authenticated_client: httpx.AsyncClient):
    # 1. Create user
    create_res = await authenticated_client.post(
        "/api/admin/users",
        json={"username": "operator2", "role": "user"},
    )
    assert create_res.status_code == 201
    user_id = create_res.json()["user"]["id"]
    temp_pw = create_res.json()["temporary_password"]

    # 2. Disable user
    patch_res = await authenticated_client.patch(
        f"/api/admin/users/{user_id}",
        json={"enabled": False},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["enabled"] is False

    # 3. Login attempt should fail with 401
    transport = authenticated_client._transport
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as user_client:
        login_res = await user_client.post(
            "/api/auth/login",
            json={"username": "operator2", "password": temp_pw},
        )
        assert login_res.status_code == 401


@pytest.mark.asyncio
async def test_non_admin_forbidden_from_admin_and_infra_routes(
    authenticated_client: httpx.AsyncClient,
):
    # 1. Create user
    create_res = await authenticated_client.post(
        "/api/admin/users",
        json={"username": "regular_user", "role": "user"},
    )
    temp_pw = create_res.json()["temporary_password"]

    # 2. Log in as regular user
    transport = authenticated_client._transport
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as user_client:
        login_res = await user_client.post(
            "/api/auth/login",
            json={"username": "regular_user", "password": temp_pw},
        )
        assert login_res.status_code == 200

        # Attempt to access /api/admin/users -> 403 Forbidden
        admin_res = await user_client.get("/api/admin/users")
        assert admin_res.status_code == 403

        # Attempt to access /api/models -> 403 Forbidden
        models_res = await user_client.get("/api/models")
        assert models_res.status_code == 403


@pytest.mark.asyncio
async def test_admin_list_sessions(authenticated_client: httpx.AsyncClient):
    sessions_res = await authenticated_client.get("/api/admin/sessions")
    assert sessions_res.status_code == 200
    sessions = sessions_res.json()
    assert len(sessions) >= 1
    assert any(s["username"] == "admin" for s in sessions)
