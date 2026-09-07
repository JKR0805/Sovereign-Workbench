"""Run lifecycle contracts."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from vajra.core.enums import ExecutionMode, RunStatus, StepStatus
from vajra.store.models import RunRecord, RunStepRecord


class RunAttachment(BaseModel):
    """An uploaded input, as the run sees it."""

    model_config = ConfigDict(frozen=True)

    filename: str
    mime: str
    size_bytes: int = 0
    document_id: str | None = None
    page_count: int | None = None
    scanned_page_count: int | None = None


class RunCreateRequest(BaseModel):
    """``POST /api/runs``.

    ``execution_mode`` is explicit and defaults to ``demo``. The demo path is a
    deterministic scaffold execution that performs **no model inference**; it
    exists to exercise the event, persistence and SSE spine end to end. The
    ``agent`` path is the production path and is not implemented yet, so it fails
    with 501 rather than quietly falling back to the demo path.
    """

    model_config = ConfigDict(extra="forbid")

    prompt: str = Field(min_length=1)
    project_id: str | None = None
    agent_id: str | None = None
    attachments: list[RunAttachment] = Field(default_factory=list)
    execution_mode: ExecutionMode = ExecutionMode.DEMO


class RunStepRead(BaseModel):
    id: str
    ordinal: int
    node_id: str
    kind: str
    status: StepStatus
    routing_decision: dict[str, Any] = Field(default_factory=dict)
    started_at: datetime | None = None
    duration_ms: float | None = None

    @classmethod
    def from_record(cls, record: RunStepRecord) -> RunStepRead:
        return cls(
            id=record.id,
            ordinal=record.ordinal,
            node_id=record.node_id,
            kind=record.kind,
            status=record.status,
            routing_decision=dict(record.routing_decision or {}),
            started_at=record.started_at,
            duration_ms=record.duration_ms,
        )


class RunRead(BaseModel):
    id: str
    prompt: str
    status: RunStatus
    execution_mode: ExecutionMode
    project_id: str | None
    agent_id: str | None
    task_spec: dict[str, Any] = Field(default_factory=dict)
    budget: dict[str, Any] = Field(default_factory=dict)
    models_used: list[str] = Field(default_factory=list)
    attachments: list[dict[str, Any]] = Field(default_factory=list)
    total_tokens: int
    started_at: datetime | None
    finished_at: datetime | None
    duration_ms: float | None
    error: str | None
    created_at: datetime

    @classmethod
    def from_record(cls, record: RunRecord) -> RunRead:
        return cls(
            id=record.id,
            prompt=record.prompt,
            status=record.status,
            execution_mode=ExecutionMode(record.execution_mode),
            project_id=record.project_id,
            agent_id=record.agent_id,
            task_spec=dict(record.task_spec or {}),
            budget=dict(record.budget or {}),
            models_used=list(record.models_used or []),
            attachments=list(record.attachments or []),
            total_tokens=record.total_tokens,
            started_at=record.started_at,
            finished_at=record.finished_at,
            duration_ms=record.duration_ms,
            error=record.error,
            created_at=record.created_at,
        )


class RunCreated(BaseModel):
    """Long operations return ``{run_id}`` immediately and stream (Section M)."""

    run_id: str
    status: RunStatus
    execution_mode: ExecutionMode
    events_url: str


class RunListPage(BaseModel):
    items: list[RunRead]
    total: int
    limit: int
    offset: int
