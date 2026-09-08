"""Additive schema sync: add columns and indexes ``create_all`` cannot.

``SQLModel.metadata.create_all`` (called by :func:`~vajra.store.database.init_schema`
on every boot) creates tables that do not yet exist, but it never alters a table
that already exists -- adding a field to a model that has shipped is silently a
no-op, and the first query touching that column raises
``OperationalError: no such column`` instead of failing at startup where it
would be diagnosable.

This module closes that gap for the one case SQLite can do safely:
``ALTER TABLE ... ADD COLUMN``. It is deliberately narrow. It never drops,
renames, retypes or reorders a column, and it never touches a table that does
not already exist (table creation stays ``create_all``'s job). Anything it
cannot add safely -- a primary key, a NOT NULL column with no default, a
UNIQUE column, a foreign key with a non-NULL default -- is reported as a
:class:`ManualMigration`, never silently skipped. That refusal is the point:
a project this size does not need Alembic, but it does need to never guess.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from sqlalchemy import Column, Table, inspect, text
from sqlalchemy.engine import Dialect
from sqlalchemy.ext.asyncio import AsyncEngine
from sqlmodel import SQLModel

logger = logging.getLogger(__name__)

#: Literal Python types whose SQLAlchemy default can be rendered inline in an
#: ``ALTER TABLE ... ADD COLUMN`` statement. A callable default (e.g.
#: ``default_factory=utcnow``) cannot be rendered this way; such a column is
#: still added, just without a default, and the application fills it going
#: forward.
_LITERAL_DEFAULT_TYPES = (str, int, float, bool)


@dataclass(frozen=True, slots=True)
class AddedColumn:
    table: str
    column: str
    ddl: str


@dataclass(frozen=True, slots=True)
class ManualMigration:
    table: str
    column: str
    reason: str


@dataclass(slots=True)
class SyncReport:
    added: list[AddedColumn] = field(default_factory=list)
    manual: list[ManualMigration] = field(default_factory=list)
    indexes_created: list[str] = field(default_factory=list)

    @property
    def is_clean(self) -> bool:
        return not self.added and not self.manual and not self.indexes_created


def _render_default(dialect: Dialect, column: Column[object]) -> str | None:
    """A literal ``DEFAULT`` clause, or ``None`` when the default cannot be
    rendered inline (a callable ``default_factory``, or no default at all)."""
    default = getattr(column, "default", None)
    if default is None or getattr(default, "is_callable", False):
        return None
    arg = getattr(default, "arg", None)
    if not isinstance(arg, _LITERAL_DEFAULT_TYPES):
        return None
    try:
        literal_processor = column.type.literal_processor(dialect=dialect)
        if literal_processor is None:
            return None
        return f" DEFAULT {literal_processor(arg)}"
    except Exception:  # pragma: no cover - defensive; falls back to no default
        return None


def _column_ddl(dialect: Dialect, column: Column[object]) -> tuple[str, str | None, bool]:
    """Returns ``(type_sql, default_clause_or_None, has_unrenderable_default)``."""
    type_sql = column.type.compile(dialect=dialect)
    has_callable_default = getattr(getattr(column, "default", None), "is_callable", False)
    default_clause = _render_default(dialect, column)
    return type_sql, default_clause, has_callable_default


def _refusal_reason(column: Column[object], table: Table) -> str | None:
    """Why a column cannot be safely added with ``ALTER TABLE ADD COLUMN``,
    or ``None`` when it can be."""
    if getattr(column, "primary_key", False):
        return "primary key columns cannot be added after table creation"
    if getattr(column, "unique", False):
        return "UNIQUE columns cannot be added via ALTER TABLE in SQLite"
    for constraint in getattr(table, "constraints", ()):
        columns = getattr(constraint, "columns", None)
        if columns is not None and column.name in columns and len(columns) == 1:
            constraint_type = type(constraint).__name__
            if "Unique" in constraint_type:
                return "UNIQUE columns cannot be added via ALTER TABLE in SQLite"
    if not column.nullable:
        default = getattr(column, "default", None)
        if default is None:
            return "NOT NULL column has no default; SQLite cannot add one without either"
    if getattr(column, "foreign_keys", None):
        default = getattr(column, "default", None)
        has_non_null_default = default is not None and not getattr(
            default, "is_callable", False
        )
        if has_non_null_default:
            return "foreign-key columns with a non-NULL default need a manual migration"
    return None


async def sync_additive_columns(
    engine: AsyncEngine, *, tables: list[str] | None = None
) -> SyncReport:
    """Add columns and indexes present in the SQLModel metadata but absent
    from the live schema. Strictly additive; every refusal is reported, never
    silently skipped. Idempotent: a second run against an already-synced
    database reports an empty (clean) result.
    """
    report = SyncReport()

    async with engine.begin() as connection:
        existing_tables = await connection.run_sync(
            lambda sync_conn: set(inspect(sync_conn).get_table_names())
        )

        for table in SQLModel.metadata.sorted_tables:
            if tables is not None and table.name not in tables:
                continue
            if table.name not in existing_tables:
                # create_all owns table creation; a brand-new table gets every
                # column for free and needs nothing from this module.
                continue

            existing_columns = await connection.run_sync(
                lambda sync_conn, t=table: {
                    row["name"] for row in inspect(sync_conn).get_columns(t.name)
                }
            )

            for column in table.columns:
                if column.name in existing_columns:
                    continue

                reason = _refusal_reason(column, table)
                if reason is not None:
                    report.manual.append(
                        ManualMigration(table=table.name, column=column.name, reason=reason)
                    )
                    continue

                dialect = connection.dialect
                type_sql, default_clause, has_callable_default = _column_ddl(dialect, column)
                ddl = (
                    f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {type_sql}'
                    f"{default_clause or ''}"
                )
                await connection.execute(text(ddl))
                report.added.append(AddedColumn(table=table.name, column=column.name, ddl=ddl))
                if has_callable_default:
                    logger.info(
                        "schema sync: %s.%s added without its callable default; "
                        "existing rows hold NULL until the application writes a value",
                        table.name,
                        column.name,
                    )

            existing_indexes = await connection.run_sync(
                lambda sync_conn, t=table: {
                    row["name"] for row in inspect(sync_conn).get_indexes(t.name)
                }
            )
            for index in table.indexes:
                if index.name in existing_indexes:
                    continue
                # An index over a column this pass just refused to add cannot
                # be created either; skip it quietly, it will be retried once
                # the manual migration lands.
                index_columns = {c.name for c in index.columns}
                if not index_columns.issubset(existing_columns | {c.name for c in table.columns}):
                    continue
                if any(
                    manual.table == table.name and manual.column in index_columns
                    for manual in report.manual
                ):
                    continue
                await connection.run_sync(
                    lambda sync_conn, idx=index: idx.create(bind=sync_conn, checkfirst=True)
                )
                report.indexes_created.append(f"{table.name}.{index.name}")

    return report


__all__ = ["AddedColumn", "ManualMigration", "SyncReport", "sync_additive_columns"]
