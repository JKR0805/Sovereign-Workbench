"""Integration tests for Conversation and Run multi-user isolation."""

from __future__ import annotations

import httpx
import pytest


@pytest.mark.asyncio
async def test_conversation_ownership_and_isolation(authenticated_client: httpx.AsyncClient):
    transport = authenticated_client._transport

    # 1. Admin creates user_a and user_b
    res_a = await authenticated_client.post(
        "/api/admin/users", json={"username": "user_a", "role": "user"}
    )
    pw_a = res_a.json()["temporary_password"]

    res_b = await authenticated_client.post(
        "/api/admin/users", json={"username": "user_b", "role": "user"}
    )
    pw_b = res_b.json()["temporary_password"]

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client_a:
        await client_a.post("/api/auth/login", json={"username": "user_a", "password": pw_a})

        # User A creates a confidential conversation
        create_res = await client_a.post(
            "/api/conversations", json={"title": "Confidential A Project"}
        )
        assert create_res.status_code == 201
        conv_a_id = create_res.json()["id"]

        # User A can list and get it
        list_a = await client_a.get("/api/conversations")
        assert any(c["id"] == conv_a_id for c in list_a.json()["items"])

        get_a = await client_a.get(f"/api/conversations/{conv_a_id}")
        assert get_a.status_code == 200

        # Now User B logs in
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client_b:
            await client_b.post("/api/auth/login", json={"username": "user_b", "password": pw_b})

            # User B's list should NOT contain User A's conversation
            list_b = await client_b.get("/api/conversations")
            assert not any(c["id"] == conv_a_id for c in list_b.json()["items"])

            # User B requesting User A's conversation directly MUST get 404 (defensive default)
            get_b = await client_b.get(f"/api/conversations/{conv_a_id}")
            assert get_b.status_code == 404

            # User B trying to delete User A's conversation MUST get 404
            del_b = await client_b.delete(f"/api/conversations/{conv_a_id}")
            assert del_b.status_code == 404

        # Admin oversight: Admin CAN inspect User A's conversation
        admin_get = await authenticated_client.get(f"/api/conversations/{conv_a_id}")
        assert admin_get.status_code == 200
        assert admin_get.json()["title"] == "Confidential A Project"
