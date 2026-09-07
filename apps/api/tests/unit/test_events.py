"""Unit tests for the event subsystem (types, models, bus, sequencing, replay)."""

from __future__ import annotations

import pytest

from vajra.events.bus import EventBus
from vajra.events.models import Event, EventDraft
from vajra.events.store import InMemoryEventStore
from vajra.events.types import EventType


@pytest.mark.asyncio
async def test_event_draft_to_event() -> None:
    """EventDraft converts to Event correctly with allocated sequence number."""
    draft = EventDraft(
        type=EventType.RUN_CREATED,
        run_id="run-123",
        node_id="node-1",
        payload={"task": "analyze data"},
    )
    assert draft.stream == "run-123"

    event = Event.from_draft(draft, seq=1)
    assert event.seq == 1
    assert event.stream == "run-123"
    assert event.run_id == "run-123"
    assert event.type == EventType.RUN_CREATED
    assert event.payload["task"] == "analyze data"
    assert event.id is not None
    assert event.ts is not None


@pytest.mark.asyncio
async def test_event_bus_monotonic_sequencing(in_memory_event_bus: EventBus) -> None:
    """Events on the same stream receive strictly monotonic sequence numbers starting at 1."""
    e1 = await in_memory_event_bus.emit_event(EventType.RUN_CREATED, run_id="run-test")
    e2 = await in_memory_event_bus.emit_event(EventType.NODE_ENTERED, run_id="run-test")
    e3 = await in_memory_event_bus.emit_event(EventType.NODE_COMPLETED, run_id="run-test")

    assert e1.seq == 1
    assert e2.seq == 2
    assert e3.seq == 3

    # Different stream gets its own sequence starting at 1
    other = await in_memory_event_bus.emit_event(EventType.RUN_CREATED, run_id="run-other")
    assert other.seq == 1


@pytest.mark.asyncio
async def test_event_bus_subscription_delivery(in_memory_event_bus: EventBus) -> None:
    """Subscribers receive emitted events in real time."""
    sub = in_memory_event_bus.subscribe("run-sub")
    async with sub:
        await in_memory_event_bus.emit_event(
            EventType.LLM_TOKEN, run_id="run-sub", text="Hello"
        )
        received = await sub.get(timeout=1.0)
        assert received is not None
        assert received.type == EventType.LLM_TOKEN
        assert received.payload.get("text") == "Hello"


@pytest.mark.asyncio
async def test_event_bus_replay(in_memory_event_bus: EventBus) -> None:
    """Event replay retrieves past events with 'since' filtering."""
    for i in range(5):
        await in_memory_event_bus.emit_event(
            EventType.LLM_TOKEN, run_id="run-replay", index=i
        )

    all_events = await in_memory_event_bus.replay("run-replay")
    assert len(all_events) == 5
    assert [e.seq for e in all_events] == [1, 2, 3, 4, 5]

    since_3 = await in_memory_event_bus.replay("run-replay", since=3)
    assert len(since_3) == 2
    assert [e.seq for e in since_3] == [4, 5]


@pytest.mark.asyncio
async def test_event_bus_backpressure() -> None:
    """A slow subscriber whose queue is full is marked lagged and drops events."""
    bus = EventBus(InMemoryEventStore(), subscriber_queue_size=2, ring_size=10)
    sub = bus.subscribe("run-lag")
    async with sub:
        # Fill the queue (size 2)
        await bus.emit_event(EventType.LLM_TOKEN, run_id="run-lag", idx=1)
        await bus.emit_event(EventType.LLM_TOKEN, run_id="run-lag", idx=2)
        assert not sub.lagged
        assert sub.dropped == 0

        # Overflow
        await bus.emit_event(EventType.LLM_TOKEN, run_id="run-lag", idx=3)
        assert sub.lagged
        assert sub.dropped == 1
