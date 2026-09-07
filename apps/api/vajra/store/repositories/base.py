"""Shared repository base."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession


class Repository:
    """Holds the session. Nothing else lives here on purpose."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
