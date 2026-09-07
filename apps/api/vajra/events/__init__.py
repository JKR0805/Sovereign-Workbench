"""Append-only typed event log plus async fanout to subscribers.

Section D calls this the backbone: one table, one Python type, one SSE endpoint.
Usable without FastAPI; the API layer only wraps :func:`vajra.events.sse.stream_events`
in a streaming response.
"""

from vajra.events.bus import EventBus, Subscription, subscription
from vajra.events.models import Event, EventDraft
from vajra.events.store import EventStore, InMemoryEventStore, SqlEventStore
from vajra.events.types import GLOBAL_STREAM, EventType

__all__ = [
    "GLOBAL_STREAM",
    "Event",
    "EventBus",
    "EventDraft",
    "EventStore",
    "EventType",
    "InMemoryEventStore",
    "SqlEventStore",
    "Subscription",
    "subscription",
]
