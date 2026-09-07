"""The network event ledger and the sovereignty snapshot.

Sits between the four enforcement layers and the rest of the system: it persists
what they observe as ``network_events`` rows, emits ``EGRESS_ATTEMPT`` and
``EGRESS_BLOCKED`` events onto the global stream, and assembles the snapshot the
Network page renders.

Every number in :class:`SovereigntySnapshot` is measured or ``None``. There is no
default and no placeholder. A field that could not be read is null, and the UI
must render null as "unavailable", never as zero.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from pydantic import BaseModel, Field

from vajra.core.config import Settings
from vajra.core.enums import EgressLayer, EgressVerdict
from vajra.events.bus import EventBus
from vajra.events.types import EventType
from vajra.sentinel.connections import ConnectionAuditor, ConnectionSnapshot
from vajra.sentinel.nft import NftablesSentinel, NftCounter
from vajra.sovereignty.policy import EgressAttempt, EgressDecision, EgressPolicy
from vajra.store.database import Database
from vajra.store.models import NetworkEventRecord, SovereigntySnapshotRecord
from vajra.store.repositories.sovereignty import SovereigntyRepository


class NetworkEvent(BaseModel):
    """One ledger entry, as the API returns it."""

    id: str
    ts: datetime
    direction: str
    src: str | None = None
    dst_ip: str | None = None
    dst_host: str | None = None
    dst_port: int | None = None
    proto: str | None = None
    process: str | None = None
    verdict: EgressVerdict
    layer: EgressLayer
    raw_log: str | None = None
    stack_frame: str | None = None

    @classmethod
    def from_record(cls, record: NetworkEventRecord) -> NetworkEvent:
        return cls(
            id=record.id,
            ts=record.ts,
            direction=record.direction,
            src=record.src,
            dst_ip=record.dst_ip,
            dst_host=record.dst_host,
            dst_port=record.dst_port,
            proto=record.proto,
            process=record.process,
            verdict=record.verdict,
            layer=record.layer,
            raw_log=record.raw_log,
            stack_frame=record.stack_frame,
        )


class SovereigntySnapshot(BaseModel):
    """What ``GET /api/network/snapshot`` returns."""

    ts: datetime
    connections: ConnectionSnapshot
    nft_counter: NftCounter
    app_blocked_total: int
    """Attempts blocked by the in-process guard. Persisted count, not a guess."""

    external_connections: int | None = None
    internal_connections: int | None = None
    local_connections: int | None = None
    services: dict[str, str] = Field(default_factory=dict)


class NetworkLedger:
    """Persists network events and assembles the sovereignty snapshot."""

    def __init__(self, database: Database, events: EventBus, settings: Settings) -> None:
        self._database = database
        self._events = events
        self._settings = settings
        self._policy = EgressPolicy(settings.sovereignty.extra_allowed_cidrs)
        self._connections = ConnectionAuditor(self._policy)
        self._nft = NftablesSentinel(settings.sovereignty)

    # --- ingestion -------------------------------------------------------

    async def record(
        self,
        *,
        dst_ip: str | None,
        dst_port: int | None,
        verdict: EgressVerdict,
        layer: EgressLayer,
        dst_host: str | None = None,
        src: str | None = None,
        proto: str | None = None,
        process: str | None = None,
        raw_log: str | None = None,
        stack_frame: str | None = None,
    ) -> NetworkEvent:
        """Persist a network event and emit the matching global events."""
        record = NetworkEventRecord(
            dst_ip=dst_ip,
            dst_host=dst_host,
            dst_port=dst_port,
            src=src,
            proto=proto,
            process=process,
            verdict=verdict,
            layer=layer,
            raw_log=raw_log,
            stack_frame=stack_frame,
        )
        async with self._database.session() as session:
            await SovereigntyRepository(session).add_network_event(record)

        payload = NetworkEvent.from_record(record).model_dump(mode="json")
        await self._events.emit_event(EventType.EGRESS_ATTEMPT, **payload)
        if verdict is EgressVerdict.BLOCK:
            await self._events.emit_event(EventType.EGRESS_BLOCKED, **payload)
        return NetworkEvent.from_record(record)

    def sink(self, loop: asyncio.AbstractEventLoop) -> object:
        """Build a guard sink that hands attempts to the event loop.

        The guard calls its sinks synchronously, from whatever thread attempted
        the connection, so the sink must not block. It schedules the async record
        and returns immediately.
        """

        def _sink(attempt: EgressAttempt, decision: EgressDecision) -> None:
            coroutine = self.record(
                dst_ip=attempt.host,
                dst_port=attempt.port,
                verdict=decision.verdict,
                layer=decision.layer,
                stack_frame=attempt.stack_frame,
                proto="TCP",
            )
            asyncio.run_coroutine_threadsafe(coroutine, loop)

        return _sink

    # --- reads -----------------------------------------------------------

    async def events(self, *, limit: int = 100) -> list[NetworkEvent]:
        async with self._database.session() as session:
            records = await SovereigntyRepository(session).list_network_events(limit=limit)
        return [NetworkEvent.from_record(record) for record in records]

    async def snapshot(self, *, persist: bool = False) -> SovereigntySnapshot:
        """Assemble the live snapshot from every layer that can answer."""
        connections = self._connections.snapshot()
        counter = self._nft.counter()

        async with self._database.session() as session:
            blocked_total = await SovereigntyRepository(session).count_blocked()

        snapshot = SovereigntySnapshot(
            ts=datetime.now(UTC),
            connections=connections,
            nft_counter=counter,
            app_blocked_total=blocked_total,
            external_connections=connections.external,
            internal_connections=connections.internal,
            local_connections=connections.local,
            services={
                "ollama": self._settings.ollama.base_url,
                "qdrant": self._settings.qdrant.url,
            },
        )

        if persist:
            async with self._database.session() as session:
                await SovereigntyRepository(session).add_snapshot(
                    SovereigntySnapshotRecord(
                        ts=snapshot.ts,
                        external_conns=connections.external,
                        internal_conns=connections.internal,
                        local_conns=connections.local,
                        blocked_total=blocked_total,
                        nft_counter=counter.packets,
                        services=dict(snapshot.services),
                    )
                )
        return snapshot

    def ruleset(self) -> object:
        return self._nft.ruleset()

    def nft_status(self) -> object:
        return self._nft.status()
