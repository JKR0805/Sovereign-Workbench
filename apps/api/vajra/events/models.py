"""The event type.

Every event carries the structural fields from Section D::

    {id, seq, run_id?, ts, type, node_id?, payload, duration_ms?}

``seq`` is monotonic within a *stream*. A stream is a run id, or
:data:`~vajra.events.types.GLOBAL_STREAM` for events that belong to no run. This
is a small extension of the plan, which says "monotonic integer per run": the
plan also requires ``EGRESS_ATTEMPT`` to fire "always, even outside runs", so
those events need a sequence space of their own to be replayable by the Network
page. Documented in ``docs/EVENTS.md``.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from vajra.events.types import GLOBAL_EVENT_TYPES, GLOBAL_STREAM, EventType


def _utcnow() -> datetime:
    return datetime.now(UTC)


class EventDraft(BaseModel):
    """An event before the bus has assigned it a sequence number.

    Producers construct drafts; only :class:`~vajra.events.bus.EventBus` turns a
    draft into an :class:`Event`, because only the bus may allocate ``seq``.
    """

    model_config = ConfigDict(frozen=True)

    type: EventType
    run_id: str | None = None
    node_id: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    duration_ms: float | None = None

    @property
    def stream(self) -> str:
        """Which sequence space this event belongs to."""
        if self.type in GLOBAL_EVENT_TYPES or self.run_id is None:
            return GLOBAL_STREAM
        return self.run_id


class Event(BaseModel):
    """A sequenced, persisted event."""

    model_config = ConfigDict(frozen=True)

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    seq: int
    stream: str
    run_id: str | None = None
    ts: datetime = Field(default_factory=_utcnow)
    type: EventType
    node_id: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    duration_ms: float | None = None

    @classmethod
    def from_draft(cls, draft: EventDraft, seq: int) -> Event:
        return cls(
            seq=seq,
            stream=draft.stream,
            run_id=draft.run_id,
            type=draft.type,
            node_id=draft.node_id,
            payload=dict(draft.payload),
            duration_ms=draft.duration_ms,
        )

    def to_wire(self) -> dict[str, Any]:
        """JSON-safe representation. This is the exact shape the UI reducer sees."""
        return {
            "id": self.id,
            "seq": self.seq,
            "stream": self.stream,
            "run_id": self.run_id,
            "ts": self.ts.isoformat(),
            "type": self.type.value,
            "node_id": self.node_id,
            "payload": self.payload,
            "duration_ms": self.duration_ms,
        }
