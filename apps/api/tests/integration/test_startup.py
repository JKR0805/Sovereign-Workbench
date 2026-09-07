"""Integration tests for application startup, health endpoints, and database initialization."""

from __future__ import annotations

import httpx
import pytest

from vajra import __version__
from vajra.core.dependencies import AppContext


@pytest.mark.asyncio
async def test_ping_endpoint(async_client: httpx.AsyncClient) -> None:
    """GET /api/system/ping returns 200 with status and version."""
    response = await async_client.get("/api/system/ping")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["version"] == __version__


@pytest.mark.asyncio
async def test_health_endpoint(async_client: httpx.AsyncClient) -> None:
    """GET /api/system/health returns system metadata and service health probes."""
    response = await async_client.get("/api/system/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "version" in data
    assert "database_journal_mode" in data
    assert "services" in data
    assert isinstance(data["services"], list)


@pytest.mark.asyncio
async def test_tools_listing_endpoint(async_client: httpx.AsyncClient) -> None:
    """GET /api/tools returns the registered MVP tools."""
    response = await async_client.get("/api/tools")
    assert response.status_code == 200
    tools = response.json()
    assert isinstance(tools, list)
    names = {t["name"] for t in tools}
    assert "knowledge.search" in names
    assert "python.execute" in names


@pytest.mark.asyncio
async def test_sandbox_status_endpoint(async_client: httpx.AsyncClient) -> None:
    """GET /api/sandbox/status returns container sandbox availability and policy."""
    response = await async_client.get("/api/sandbox/status")
    assert response.status_code == 200
    data = response.json()
    assert "available" in data
    assert "policy" in data


@pytest.mark.asyncio
async def test_database_initialization(test_context: AppContext) -> None:
    """Test context database is created and initialized with journal_mode WAL."""
    from vajra.store.database import journal_mode

    mode = await journal_mode(test_context.database.engine)
    assert mode.lower() == "wal"
