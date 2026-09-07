"""Artifact contracts (Section P: "DOCX generation, genuinely well-formatted").

An :class:`ArtifactSpec` is a *structured* document description, not prose. The
model fills a fixed schema and the renderer lays it out. Section V, risk 2:
"Constrain it hard: structured output into a fixed DOCX template with sections it
must fill, rather than free-form drafting."
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field

from vajra.core.enums import ArtifactKind


class BlockKind(str, Enum):
    HEADING = "heading"
    PARAGRAPH = "paragraph"
    BULLETS = "bullets"
    TABLE = "table"
    KEY_VALUES = "key_values"
    PAGE_BREAK = "page_break"
    CITATIONS = "citations"
    UNSUPPORTED_CLAIMS = "unsupported_claims"


class DocumentBlock(BaseModel):
    """One renderable block. Only the fields its kind uses are populated."""

    model_config = ConfigDict(frozen=True)

    kind: BlockKind
    text: str | None = None
    level: int = 1
    items: list[str] = Field(default_factory=list)
    columns: list[str] = Field(default_factory=list)
    rows: list[list[str]] = Field(default_factory=list)
    pairs: dict[str, str] = Field(default_factory=dict)


class ArtifactSpec(BaseModel):
    """What to render. Renderer-agnostic."""

    kind: ArtifactKind
    filename: str
    title: str
    subtitle: str | None = None
    metadata: dict[str, str] = Field(default_factory=dict)
    blocks: list[DocumentBlock] = Field(default_factory=list)
    citations: list[str] = Field(default_factory=list)
    unsupported_claims: list[str] = Field(default_factory=list)
    """Claims the verifier could not ground. Rendered explicitly, never dropped."""


class Artifact(BaseModel):
    """A file that exists on disk. Every field is read from the written file."""

    id: str
    run_id: str | None = None
    kind: ArtifactKind
    filename: str
    path: str
    size_bytes: int
    sha256: str
    mime: str
    created_at: datetime


class RendererStatus(BaseModel):
    """Whether a renderer can actually produce a file right now."""

    kind: ArtifactKind
    available: bool
    detail: str
