"""Audit endpoints (Section M, "Audit").

The event log has two consumers and one mechanism: the live UI, and the audit
export. Both read the same ``events`` table.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from vajra.core.dependencies import Context
from vajra.core.exceptions import NotImplementedYet
from vajra.events.store import _record_to_event
from vajra.events.types import EventType
from vajra.store.repositories.events import EventRepository

router = APIRouter(prefix="/api/audit", tags=["audit"])


class AuditEventPage(BaseModel):
    items: list[dict[str, Any]] = Field(default_factory=list)
    total: int
    limit: int
    offset: int


@router.get("/events", response_model=AuditEventPage)
async def list_events(
    context: Context,
    run_id: Annotated[str | None, Query()] = None,
    event_type: Annotated[EventType | None, Query(alias="type")] = None,
    limit: Annotated[int, Query(ge=1, le=1000)] = 200,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> AuditEventPage:
    """Query the append-only event log. Newest first."""
    async with context.database.session() as session:
        repository = EventRepository(session)
        records = await repository.query(
            run_id=run_id,
            event_type=event_type.value if event_type else None,
            limit=limit,
            offset=offset,
        )
        total = await repository.count(run_id=run_id)
    return AuditEventPage(
        items=[_record_to_event(record).to_wire() for record in records],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/export")
async def export_bundle(
    context: Context, run_id: Annotated[str | None, Query()] = None
) -> dict[str, Any]:
    """Signed JSON audit bundle for a run.

    Not implemented. The bundle must be Ed25519-signed with a key generated at
    first boot and stored locally, so the export carries a verifiable chain of
    custody (Section K). An unsigned bundle presented as signed would be worse
    than no bundle at all.
    """
    raise NotImplementedYet(
        "Signed audit export is not implemented. It requires Ed25519 key generation at "
        "first boot and a canonical serialisation of the run's events, model decisions, "
        "retrieved chunk ids, tool calls and file hashes.",
        run_id=run_id,
    )


@router.get("/event-types", response_model=list[str])
async def list_event_types() -> list[str]:
    """The event vocabulary, for the audit explorer's filter."""
    return [event_type.value for event_type in EventType]
