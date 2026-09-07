"""Shared pytest fixtures for VAJRA backend tests."""

from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI

from vajra.core.config import (
    DatabaseSettings,
    PathSettings,
    Profile,
    QdrantSettings,
    Settings,
    SovereigntySettings,
)
from vajra.core.dependencies import AppContext, build_context, shutdown, startup
from vajra.events.bus import EventBus
from vajra.events.store import InMemoryEventStore
from vajra.main import create_app


@pytest.fixture
def in_memory_event_bus() -> EventBus:
    """An EventBus backed by InMemoryEventStore for isolated unit tests."""
    return EventBus(InMemoryEventStore(), subscriber_queue_size=128, ring_size=64)


@pytest.fixture
def test_settings(tmp_path: Path) -> Settings:
    """Isolated test settings rooted in a temporary directory."""
    db_path = str(tmp_path / "vajra_test.db")
    base_dir = str(tmp_path)
    artifacts_dir = str(tmp_path / "artifacts")
    data_dir = str(tmp_path / "data")
    logs_dir = str(tmp_path / "logs")

    for d in (artifacts_dir, data_dir, logs_dir):
        Path(d).mkdir(parents=True, exist_ok=True)

    return Settings(
        profile=Profile.DEVELOPMENT,
        paths=PathSettings(
            base_dir=base_dir,
            data_dir=data_dir,
            artifacts_dir=artifacts_dir,
            logs_dir=logs_dir,
        ),
        database=DatabaseSettings(
            path=db_path,
            pool_size=5,
            timeout_seconds=5.0,
        ),
        qdrant=QdrantSettings(
            path=":memory:",
            cloud_inference=False,
        ),
        sovereignty=SovereigntySettings(
            egress_guard_enabled=False,
            selfaudit_enabled=False,
        ),
    )


@pytest.fixture
async def test_context(test_settings: Settings) -> AsyncIterator[AppContext]:
    """An initialized AppContext running against an isolated SQLite database."""
    context = build_context(test_settings)
    await startup(context)
    try:
        yield context
    finally:
        await shutdown(context)


@pytest.fixture
def test_app(test_context: AppContext) -> FastAPI:
    """FastAPI application wired to the test AppContext."""
    app = create_app()
    app.state.context = test_context
    return app


@pytest.fixture
async def async_client(test_app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    """Httpx async test client targeting the in-memory ASGI test application."""
    transport = httpx.ASGITransport(app=test_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client
