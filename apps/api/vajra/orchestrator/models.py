"""Run and conversation lifecycle contracts."""

from __future__ import annotations

from datetime import datetime
from typing import Any, ClassVar

from pydantic import BaseModel, ConfigDict, Field

from vajra.core.enums import AttachmentKind, ExecutionMode, MessageStatus, RunStatus, StepStatus
from vajra.store.models import ConversationRecord, MessageRecord, RunRecord, RunStepRecord


class RunAttachment(BaseModel):
    """An uploaded input, as the run sees it.

    Two paths, A preferred: ``document_id`` names a document already uploaded
    through ``POST /api/knowledge/documents`` (parsed, chunked, embedded, and
    scoped by :attr:`kind` before the run even starts). ``data_base64`` is the
    compatibility path for inline bytes -- a pasted image, or a client that has
    not moved to pre-upload yet.

    ``kind`` decides how the attachment is used and must never be inferred from
    ``bool(data_base64)``: that conflated "carries inline bytes" with "is an
    image", which sent non-image files to the vision model as pictures.
    """

    model_config = ConfigDict(frozen=True)

    filename: str
    mime: str = "application/octet-stream"
    size_bytes: int = 0
    data_base64: str | None = None
    document_id: str | None = None
    sha256: str | None = None
    kind: AttachmentKind = AttachmentKind.AUTO
    page_count: int | None = None
    scanned_page_count: int | None = None
    extracted_chars: int | None = None

    IMAGE_EXTENSIONS: ClassVar[tuple[str, ...]] = (
        ".png",
        ".jpg",
        ".jpeg",
        ".gif",
        ".webp",
        ".bmp",
        ".tiff",
    )

    @property
    def is_image(self) -> bool:
        """Mime first, extension second. Never ``bool(data_base64)``."""
        if self.kind is AttachmentKind.IMAGE:
            return True
        if self.kind is AttachmentKind.DOCUMENT:
            return False
        if self.mime.startswith("image/"):
            return True
        return self.filename.lower().endswith(self.IMAGE_EXTENSIONS)

    def redacted(self) -> dict[str, Any]:
        """Everything but the inline bytes, plus whether bytes were present.

        What actually gets persisted onto ``RunRecord.attachments`` and
        ``MessageRecord.attachments``: storing the full base64 blob in a JSON
        column made a single 5 MB image into ~6.7 MB of JSON per run, returned
        verbatim by every ``GET /api/runs`` page.
        """
        data = self.model_dump(exclude={"data_base64"}, mode="json")
        data["has_inline_data"] = self.data_base64 is not None
        return data


class RunCreateRequest(BaseModel):
    """``POST /api/runs``.

    ``execution_mode`` is explicit and defaults to ``demo``. The demo path is a
    deterministic scaffold execution that performs **no model inference**; it
    exists to exercise the event, persistence and SSE spine end to end. The
    ``agent`` path is the production path: real routing, real retrieval, real
    generation against a local runtime.

    ``conversation_id`` is the preferred way to carry multi-turn context: when
    set, the orchestrator persists both turns and rebuilds history server-side
    from storage, ignoring ``history`` entirely. ``history`` is deprecated and
    kept only so a client that has not migrated yet does not 422 on every
    request (``extra="forbid"`` below means removing the field outright would
    do exactly that).
    """

    model_config = ConfigDict(extra="forbid")

    prompt: str = Field(min_length=1)
    project_id: str | None = None
    agent_id: str | None = None
    conversation_id: str | None = None
    attachments: list[RunAttachment] = Field(default_factory=list)
    history: list[dict[str, Any]] = Field(
        default_factory=list,
        description=(
            "DEPRECATED -- ignored whenever conversation_id is set; history is then "
            "rebuilt server-side from stored messages. Send conversation_id instead. "
            "Not marked with pydantic's deprecated=True: that flag warns on every "
            "attribute *read*, including the server's own, which this application's "
            "test suite (correctly) treats as an error."
        ),
    )
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
    """Long operations return ``{run_id}`` immediately and stream (Section M).

    ``conversation_id``/``user_message_id``/``assistant_message_id`` are set
    only when the request carried a ``conversation_id``, so the client can bind
    its optimistic UI to the real stored message ids before the first token
    arrives.
    """

    run_id: str
    status: RunStatus
    execution_mode: ExecutionMode
    events_url: str
    conversation_id: str | None = None
    user_message_id: str | None = None
    assistant_message_id: str | None = None


class RunListPage(BaseModel):
    items: list[RunRead]
    total: int
    limit: int
    offset: int


# --- conversations -----------------------------------------------------


class MessageRead(BaseModel):
    id: str
    conversation_id: str
    ordinal: int
    role: str
    content: str
    status: MessageStatus
    run_id: str | None = None
    model_id: str | None = None
    runtime_model_id: str | None = None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    tokens_per_sec: float | None = None
    duration_ms: float | None = None
    citations: list[dict[str, Any]] = Field(default_factory=list)
    attachments: list[dict[str, Any]] = Field(default_factory=list)
    error: str | None = None
    created_at: datetime

    @classmethod
    def from_record(cls, record: MessageRecord) -> MessageRead:
        return cls(
            id=record.id,
            conversation_id=record.conversation_id,
            ordinal=record.ordinal,
            role=record.role,
            content=record.content,
            status=record.status,
            run_id=record.run_id,
            model_id=record.model_id,
            runtime_model_id=record.runtime_model_id,
            prompt_tokens=record.prompt_tokens,
            completion_tokens=record.completion_tokens,
            tokens_per_sec=record.tokens_per_sec,
            duration_ms=record.duration_ms,
            citations=list(record.citations or []),
            attachments=list(record.attachments or []),
            error=record.error,
            created_at=record.created_at,
        )


class ConversationRead(BaseModel):
    id: str
    user_id: str | None = None
    username: str | None = None
    project_id: str | None
    title: str
    pinned: bool
    archived: bool
    message_count: int
    total_tokens: int
    last_model_id: str | None
    last_message_at: datetime | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_record(
        cls, record: ConversationRecord, username: str | None = None
    ) -> ConversationRead:
        return cls(
            id=record.id,
            user_id=record.user_id,
            username=username,
            project_id=record.project_id,
            title=record.title,
            pinned=record.pinned,
            archived=record.archived,
            message_count=record.message_count,
            total_tokens=record.total_tokens,
            last_model_id=record.last_model_id,
            last_message_at=record.last_message_at,
            created_at=record.created_at,
            updated_at=record.updated_at,
        )


class ConversationDetail(ConversationRead):
    messages: list[MessageRead] = Field(default_factory=list)
    has_more: bool = False


class ConversationCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, max_length=200)
    project_id: str | None = None


class ConversationUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=200)
    pinned: bool | None = None
    archived: bool | None = None


class ConversationListPage(BaseModel):
    items: list[ConversationRead]
    total: int
    limit: int
    offset: int
