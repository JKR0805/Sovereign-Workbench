"""RAG data contracts (Section G).

Provenance is carried end to end: a block knows its page and bounding box, a
chunk knows the blocks it came from, and a retrieved chunk knows both. "Do not
throw provenance away at parse time; you cannot recover it."
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class BlockType(str, Enum):
    """Normalised block kinds emitted by any parser."""

    HEADING = "heading"
    PARAGRAPH = "paragraph"
    TABLE = "table"
    LIST = "list"
    CAPTION = "caption"
    FIGURE = "figure"
    FOOTER = "footer"
    UNKNOWN = "unknown"


class PageKind(str, Enum):
    """Per-page routing decision (Section I). Drives ``PAGE_CLASSIFIED``."""

    DIGITAL = "digital"
    SCANNED = "scanned"


class BBox(BaseModel):
    """Bounding box in page coordinates, origin top-left."""

    model_config = ConfigDict(frozen=True)

    page: int
    x0: float
    y0: float
    x1: float
    y1: float


class PageClassification(BaseModel):
    """One page's text-layer coverage and the routing decision it implies."""

    model_config = ConfigDict(frozen=True)

    page: int
    kind: PageKind
    text_coverage: float
    """Fraction of the page area covered by an extractable text layer."""


class Block(BaseModel):
    """A normalised unit of parsed content with full provenance."""

    model_config = ConfigDict(frozen=True)

    text: str
    type: BlockType = BlockType.PARAGRAPH
    page: int
    section_path: str | None = None
    bbox: BBox | None = None
    level: int | None = None
    """Heading level, when ``type`` is HEADING."""


class ExtractedDocument(BaseModel):
    """Parser output: blocks plus the page classification that produced them."""

    document_id: str
    title: str
    blocks: list[Block] = Field(default_factory=list)
    pages: list[PageClassification] = Field(default_factory=list)
    parser: str = "unknown"
    summary: str | None = None
    fallback_images: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @property
    def scanned_page_count(self) -> int:
        return sum(1 for page in self.pages if page.kind is PageKind.SCANNED)


class Chunk(BaseModel):
    """An indexable unit. ``embed_text`` is what actually gets embedded."""

    model_config = ConfigDict(frozen=True)

    id: str
    document_id: str
    ordinal: int
    text: str
    section_path: str | None = None
    page_from: int | None = None
    page_to: int | None = None
    bbox: list[BBox] = Field(default_factory=list)
    token_count: int = 0
    doc_title: str | None = None
    is_canonical: bool = True

    @property
    def embed_text(self) -> str:
        """Section G: prepend ``"{doc_title} > {section_path}"`` before embedding.

        Materially improves retrieval on SOP corpora where sections are terse.
        """
        prefix_parts = [part for part in (self.doc_title, self.section_path) if part]
        prefix = " > ".join(prefix_parts)
        return f"{prefix}\n\n{self.text}" if prefix else self.text


class EmbeddingVector(BaseModel):
    """A dense vector plus the optional sparse companion BGE-M3 produces."""

    model_config = ConfigDict(frozen=True)

    chunk_id: str
    dense: list[float]
    sparse_indices: list[int] = Field(default_factory=list)
    sparse_values: list[float] = Field(default_factory=list)
    model: str = ""


class RetrievedChunk(BaseModel):
    """A retrieval hit with its per-stage scores.

    All three score fields are ``None`` until the corresponding stage runs. The
    UI renders three tiny bars and must not draw one for a stage that did not
    happen.
    """

    chunk_id: str
    document_id: str
    text: str
    section_path: str | None = None
    page_from: int | None = None
    page_to: int | None = None
    doc_title: str | None = None
    dense_score: float | None = None
    sparse_score: float | None = None
    fused_score: float | None = None
    rerank_score: float | None = None

    @property
    def score(self) -> float:
        """Best available score, most-refined stage first."""
        for candidate in (self.rerank_score, self.fused_score, self.dense_score):
            if candidate is not None:
                return candidate
        return 0.0


class SearchRequest(BaseModel):
    query: str
    top_k: int = 5
    document_ids: list[str] = Field(default_factory=list)
    rerank: bool = True


class SearchTimings(BaseModel):
    """Measured stage timings. ``None`` where a stage did not run."""

    embed_ms: float | None = None
    retrieve_ms: float | None = None
    rerank_ms: float | None = None
    total_ms: float | None = None


class SearchResult(BaseModel):
    query: str
    chunks: list[RetrievedChunk] = Field(default_factory=list)
    timings: SearchTimings = SearchTimings()
    reranked: bool = False


class IngestRequest(BaseModel):
    filename: str
    mime: str
    storage_path: str
    project_id: str | None = None
    document_id: str | None = None
    run_id: str | None = None
    is_canonical: bool = True
    """When ingestion happens as part of a run's intake step, its progress
    events (``PAGE_CLASSIFIED``, ``DOCUMENT_INGESTED``) are tagged with this so
    they land on the run's own SSE stream instead of the global one -- the run
    inspector otherwise shows an intake node with zero events while a large
    file is still parsing."""


class IngestResult(BaseModel):
    document_id: str
    chunk_count: int
    page_count: int
    scanned_page_count: int
    parser: str
    ingested_at: datetime
    extracted_summary: str | None = None
    fallback_images: list[str] = Field(default_factory=list)
