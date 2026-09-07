"""SQLModel tables. The schema of Section L, one class per table.

This is the lowest layer of the application. It imports only ``vajra.core`` and
must never import a service, the API, or an adapter.

Indices that matter (Section L): ``events(run_id, seq)``,
``chunks(document_id, ordinal)``, ``runs(started_at DESC)``,
``network_events(ts DESC)``.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON as SAJSON
from sqlalchemy import Column, Index, UniqueConstraint
from sqlmodel import Field, SQLModel

from vajra.core.enums import (
    ArtifactKind,
    DocumentStatus,
    EgressLayer,
    EgressVerdict,
    HealthState,
    RunStatus,
    RuntimeKind,
    StepStatus,
)


def new_id() -> str:
    return uuid.uuid4().hex


def utcnow() -> datetime:
    return datetime.now(UTC)


def _json_column() -> Any:
    return Field(default_factory=dict, sa_column=Column(SAJSON))


def _json_list_column() -> Any:
    return Field(default_factory=list, sa_column=Column(SAJSON))


# --- runtimes and models -------------------------------------------------


class RuntimeRecord(SQLModel, table=True):
    """A reachable model runtime. ``kind`` selects the adapter implementation."""

    __tablename__ = "runtimes"

    id: str = Field(primary_key=True)
    kind: RuntimeKind
    base_url: str
    enabled: bool = True
    health: HealthState = Field(default=HealthState.UNKNOWN)
    health_detail: str | None = None
    version: str | None = None
    last_probe_at: datetime | None = None
    created_at: datetime = Field(default_factory=utcnow)


class ModelRecord(SQLModel, table=True):
    """What a model is and what it is good at (Section E, layer 2).

    Everything above ``health`` is *declared*: it is configuration, editable from
    the UI or loaded from ``config/models/*.yaml``. Everything from ``health``
    down is *measured* by probes and benchmarks and is never hand-written.

    ``runtime_model_id`` is the only runtime-specific string in the system.
    """

    __tablename__ = "models"

    id: str = Field(primary_key=True)
    display_name: str
    runtime_id: str = Field(foreign_key="runtimes.id", index=True)
    runtime_model_id: str

    # capability -> strength in 0.0..1.0
    capabilities: dict[str, float] = _json_column()
    # capability -> VerificationState
    capabilities_verified: dict[str, str] = _json_column()

    context_window: int
    max_output_tokens: int = 2048
    # Section V: both are per-model and both are shown in the UI.
    num_ctx: int | None = None
    device: str = "gpu"
    vram_gb: float = 0.0
    quantization: str = "unknown"
    modalities_in: list[str] = _json_list_column()
    priority: int = 50
    enabled: bool = True
    license: str = "unknown"

    # measured, not declared
    health: HealthState = Field(default=HealthState.UNKNOWN)
    health_detail: str | None = None
    avg_latency_ms: float | None = None
    tokens_per_sec: float | None = None
    measured_vram_gb: float | None = None
    request_count: int = 0
    error_count: int = 0
    last_probe_at: datetime | None = None
    last_used_at: datetime | None = None
    created_at: datetime = Field(default_factory=utcnow)


# --- routing -------------------------------------------------------------


class RoutingPolicyRecord(SQLModel, table=True):
    """A versioned declarative policy authored in the Routing Studio."""

    __tablename__ = "routing_policies"

    id: str = Field(default_factory=new_id, primary_key=True)
    name: str
    enabled: bool = True
    priority: int = 50
    # React Flow canvas state; opaque to the backend.
    graph: dict[str, Any] = _json_column()
    # Declarative rules applied after scoring (Section F, stage 4).
    rules: list[dict[str, Any]] = _json_list_column()
    # Overrides for the seven scoring weights (Section F, stage 3).
    weights: dict[str, float] = _json_column()
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


# --- knowledge -----------------------------------------------------------


class ProjectRecord(SQLModel, table=True):
    __tablename__ = "projects"

    id: str = Field(default_factory=new_id, primary_key=True)
    name: str
    description: str | None = None
    created_at: datetime = Field(default_factory=utcnow)


class DocumentRecord(SQLModel, table=True):
    __tablename__ = "documents"

    id: str = Field(default_factory=new_id, primary_key=True)
    project_id: str | None = Field(default=None, foreign_key="projects.id", index=True)
    filename: str
    sha256: str = Field(index=True)
    mime: str
    size_bytes: int
    page_count: int | None = None
    scanned_page_count: int | None = None
    status: DocumentStatus = Field(default=DocumentStatus.PENDING)
    parser: str | None = None
    storage_path: str | None = None
    ingested_at: datetime | None = None
    error: str | None = None
    created_at: datetime = Field(default_factory=utcnow)


class ChunkRecord(SQLModel, table=True):
    """Chunk text lives here so citations render without a Qdrant round-trip.

    Vectors live in Qdrant, keyed by ``id`` (Section D, "Persistence").
    """

    __tablename__ = "chunks"
    __table_args__ = (Index("ix_chunks_document_ordinal", "document_id", "ordinal"),)

    id: str = Field(default_factory=new_id, primary_key=True)
    document_id: str = Field(foreign_key="documents.id", index=True)
    ordinal: int
    text: str
    section_path: str | None = None
    page_from: int | None = None
    page_to: int | None = None
    bbox: list[dict[str, float]] = _json_list_column()
    token_count: int = 0
    embedded_at: datetime | None = None


# --- agents and runs -----------------------------------------------------


class AgentRecord(SQLModel, table=True):
    __tablename__ = "agents"

    id: str = Field(default_factory=new_id, primary_key=True)
    name: str
    description: str | None = None
    graph: dict[str, Any] = _json_column()
    template_plan: list[dict[str, Any]] = _json_list_column()
    default_tools: list[str] = _json_list_column()
    builtin: bool = False
    created_at: datetime = Field(default_factory=utcnow)


class RunRecord(SQLModel, table=True):
    __tablename__ = "runs"
    __table_args__ = (Index("ix_runs_started_at", "started_at"),)

    id: str = Field(default_factory=new_id, primary_key=True)
    project_id: str | None = Field(default=None, foreign_key="projects.id", index=True)
    agent_id: str | None = Field(default=None, foreign_key="agents.id", index=True)
    prompt: str
    status: RunStatus = Field(default=RunStatus.QUEUED, index=True)
    # Which execution path produced this run. See ExecutionMode: "demo" performs
    # no inference and exists to exercise the event spine.
    execution_mode: str = "demo"
    task_spec: dict[str, Any] = _json_column()
    budget: dict[str, Any] = _json_column()
    models_used: list[str] = _json_list_column()
    attachments: list[dict[str, Any]] = _json_list_column()
    total_tokens: int = 0
    started_at: datetime | None = None
    finished_at: datetime | None = None
    duration_ms: float | None = None
    error: str | None = None
    created_at: datetime = Field(default_factory=utcnow)


class RunStepRecord(SQLModel, table=True):
    __tablename__ = "run_steps"
    __table_args__ = (Index("ix_run_steps_run_ordinal", "run_id", "ordinal"),)

    id: str = Field(default_factory=new_id, primary_key=True)
    run_id: str = Field(foreign_key="runs.id", index=True)
    ordinal: int
    node_id: str
    kind: str
    status: StepStatus = Field(default=StepStatus.WAITING)
    routing_decision: dict[str, Any] = _json_column()
    input: dict[str, Any] = _json_column()
    output: dict[str, Any] = _json_column()
    started_at: datetime | None = None
    duration_ms: float | None = None


class EventRecord(SQLModel, table=True):
    """Append-only. Rows are inserted and never updated or deleted.

    ``seq`` is monotonic *within a stream*. A stream is a run id, or the sentinel
    :data:`GLOBAL_STREAM` for events that belong to no run (egress attempts, for
    instance, which happen whether or not a run is in flight).
    """

    __tablename__ = "events"
    __table_args__ = (
        UniqueConstraint("stream", "seq", name="uq_events_stream_seq"),
        Index("ix_events_run_seq", "run_id", "seq"),
        Index("ix_events_ts", "ts"),
    )

    id: str = Field(default_factory=new_id, primary_key=True)
    stream: str = Field(index=True)
    seq: int
    run_id: str | None = Field(default=None, index=True)
    ts: datetime = Field(default_factory=utcnow)
    type: str = Field(index=True)
    node_id: str | None = None
    payload: dict[str, Any] = _json_column()
    duration_ms: float | None = None


class ToolCallRecord(SQLModel, table=True):
    __tablename__ = "tool_calls"

    id: str = Field(default_factory=new_id, primary_key=True)
    run_id: str = Field(foreign_key="runs.id", index=True)
    step_id: str | None = Field(default=None, foreign_key="run_steps.id")
    tool: str = Field(index=True)
    args: dict[str, Any] = _json_column()
    result: dict[str, Any] = _json_column()
    status: str = "pending"
    error: str | None = None
    duration_ms: float | None = None
    created_at: datetime = Field(default_factory=utcnow)


class ArtifactRecord(SQLModel, table=True):
    __tablename__ = "artifacts"

    id: str = Field(default_factory=new_id, primary_key=True)
    run_id: str | None = Field(default=None, foreign_key="runs.id", index=True)
    kind: ArtifactKind
    filename: str
    path: str
    size_bytes: int
    sha256: str
    mime: str
    created_at: datetime = Field(default_factory=utcnow)


# --- sovereignty ---------------------------------------------------------


class NetworkEventRecord(SQLModel, table=True):
    """One row per observed or attempted network egress (Section K)."""

    __tablename__ = "network_events"
    __table_args__ = (Index("ix_network_events_ts", "ts"),)

    id: str = Field(default_factory=new_id, primary_key=True)
    ts: datetime = Field(default_factory=utcnow)
    direction: str = "outbound"
    src: str | None = None
    dst_ip: str | None = None
    dst_host: str | None = None
    dst_port: int | None = None
    proto: str | None = None
    process: str | None = None
    verdict: EgressVerdict = Field(default=EgressVerdict.BLOCK)
    layer: EgressLayer = Field(default=EgressLayer.APP)
    raw_log: str | None = None
    stack_frame: str | None = None


class SovereigntySnapshotRecord(SQLModel, table=True):
    """A point-in-time reading of the connection audit and kernel counters.

    Every field here is *measured*. Nothing in this table is ever seeded with a
    plausible-looking default; when a layer is unavailable its counter is NULL,
    not zero.
    """

    __tablename__ = "sovereignty_snapshots"
    __table_args__ = (Index("ix_sov_snapshots_ts", "ts"),)

    id: str = Field(default_factory=new_id, primary_key=True)
    ts: datetime = Field(default_factory=utcnow)
    external_conns: int | None = None
    internal_conns: int | None = None
    local_conns: int | None = None
    blocked_total: int | None = None
    nft_counter: int | None = None
    services: dict[str, Any] = _json_column()
