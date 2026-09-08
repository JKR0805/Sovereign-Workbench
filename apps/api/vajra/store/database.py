"""Async SQLite engine with WAL mode.

Section D: "SQLite with WAL mode via SQLModel. It is sufficient, it is one file,
it backs up by copying." Postgres would be a change to :data:`Settings.database`
and nothing else.

This module knows nothing about FastAPI. It exposes an engine, a session factory
and a schema initialiser; the API layer wires them into request dependencies.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlmodel import SQLModel

from vajra.core.config import DatabaseSettings

# Importing the table module registers every table on SQLModel.metadata. Without
# it, create_all() produces an empty schema.
from vajra.store import models as _tables  # noqa: F401
from vajra.store.schema_sync import sync_additive_columns

logger = logging.getLogger(__name__)


def _install_pragmas(engine: AsyncEngine, settings: DatabaseSettings) -> None:
    """Apply WAL and the other per-connection pragmas on every new connection."""

    @event.listens_for(engine.sync_engine, "connect")
    def _set_pragmas(dbapi_connection: Any, _record: Any) -> None:
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA synchronous=NORMAL")
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute(f"PRAGMA busy_timeout={settings.busy_timeout_ms}")
        finally:
            cursor.close()


def create_engine(settings: DatabaseSettings) -> AsyncEngine:
    """Build the async engine for the configured database path."""
    if settings.path.parent and str(settings.path.parent) not in ("", "."):
        Path(settings.path.parent).mkdir(parents=True, exist_ok=True)
    engine = create_async_engine(
        settings.url,
        echo=settings.echo,
        future=True,
        # SQLite has no server-side pooling story worth configuring here; the
        # default pool plus WAL is correct for a single-operator workbench.
    )
    _install_pragmas(engine, settings)
    return engine


def create_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_schema(engine: AsyncEngine) -> None:
    """Create every table. Idempotent, so a fresh checkout boots cleanly."""
    async with engine.begin() as connection:
        await connection.run_sync(SQLModel.metadata.create_all)


async def journal_mode(engine: AsyncEngine) -> str:
    """Report the active journal mode. Used by the health endpoint and tests."""
    async with engine.connect() as connection:
        result = await connection.execute(text("PRAGMA journal_mode"))
        row = result.first()
        return str(row[0]) if row else "unknown"


class Database:
    """Owns the engine and session factory for the process lifetime."""

    def __init__(self, settings: DatabaseSettings) -> None:
        self.settings = settings
        self.engine: AsyncEngine = create_engine(settings)
        self.session_factory = create_session_factory(self.engine)

    async def init(self) -> None:
        await init_schema(self.engine)
        if self.settings.auto_migrate:
            report = await sync_additive_columns(self.engine)
            for added in report.added:
                logger.info("schema sync: added %s.%s", added.table, added.column)
            for manual in report.manual:
                logger.warning(
                    "schema sync: %s.%s needs a manual migration: %s",
                    manual.table,
                    manual.column,
                    manual.reason,
                )

    async def dispose(self) -> None:
        await self.engine.dispose()

    @asynccontextmanager
    async def session(self) -> AsyncIterator[AsyncSession]:
        """Transactional scope. Commits on clean exit, rolls back on error."""
        async with self.session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise
