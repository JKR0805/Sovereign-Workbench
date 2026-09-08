"""Knowledge endpoints (Section M, "Knowledge").

Document upload delegates to :class:`~vajra.rag.intake.AttachmentIntake`: hash,
persist, dedupe against anything already indexed, parse, chunk, embed, index.
The same pipeline a run's intake step uses for a chat attachment.

Search raises 501 when the RAG subsystem is disabled. This is deliberate: a
search endpoint that returned an empty result would be indistinguishable from
a query that found nothing, which is exactly the kind of ambiguity the plan
forbids.
"""

from __future__ import annotations

import itertools
import logging
import re
import shutil
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from vajra.core.dependencies import Context
from vajra.core.enums import DocumentStatus
from vajra.core.exceptions import NotFound, NotImplementedYet
from vajra.rag.intake import IntakeDisposition
from vajra.store.models import ChunkRecord, DocumentRecord
from vajra.store.repositories.knowledge import KnowledgeRepository

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


# --- response models (thin, from store records) --------------------------


class DocumentRead(BaseModel):
    id: str
    project_id: str | None
    filename: str
    sha256: str
    mime: str
    size_bytes: int
    page_count: int | None
    scanned_page_count: int | None
    status: DocumentStatus
    parser: str | None
    ingested_at: datetime | None
    error: str | None
    created_at: datetime

    @classmethod
    def from_record(cls, record: DocumentRecord) -> DocumentRead:
        return cls(
            id=record.id,
            project_id=record.project_id,
            filename=record.filename,
            sha256=record.sha256,
            mime=record.mime,
            size_bytes=record.size_bytes,
            page_count=record.page_count,
            scanned_page_count=record.scanned_page_count,
            status=record.status,
            parser=record.parser,
            ingested_at=record.ingested_at,
            error=record.error,
            created_at=record.created_at,
        )


class ChunkRead(BaseModel):
    id: str
    document_id: str
    ordinal: int
    text: str
    section_path: str | None
    page_from: int | None
    page_to: int | None
    token_count: int

    @classmethod
    def from_record(cls, record: ChunkRecord) -> ChunkRead:
        return cls(
            id=record.id,
            document_id=record.document_id,
            ordinal=record.ordinal,
            text=record.text,
            section_path=record.section_path,
            page_from=record.page_from,
            page_to=record.page_to,
            token_count=record.token_count,
        )


class SearchRequest(BaseModel):
    query: str = Field(min_length=1)
    top_k: int = Field(default=5, ge=1, le=50)
    document_ids: list[str] = Field(default_factory=list)
    rerank: bool = True


class ChunkCitationResult(BaseModel):
    marker: str
    label: str
    chunk_id: str
    document_id: str
    text: str
    page_from: int | None = None
    page_to: int | None = None
    section_path: str | None = None
    doc_title: str | None = None
    score: float | None = None


class SearchResult(BaseModel):
    query: str
    chunks: list[ChunkCitationResult] = Field(default_factory=list)
    reranked: bool = False
    timings: dict[str, float | None] = Field(default_factory=dict)


# --- endpoints -----------------------------------------------------------


@router.post("/documents", response_model=DocumentRead, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile,
    context: Context,
    project_id: Annotated[str | None, Query()] = None,
) -> DocumentRead:
    """Upload a document. Persists it, hashes it, dedupes against anything
    already indexed, and runs it through the same
    :class:`~vajra.rag.intake.AttachmentIntake` pipeline a chat attachment
    uses -- this endpoint and a run's intake step are one code path now."""
    filename = file.filename or "upload"
    content = await file.read()

    result = await context.attachment_intake.intake(
        content, filename=filename, mime=file.content_type, project_id=project_id
    )

    if result.disposition is IntakeDisposition.UNSUPPORTED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=result.detail)

    assert result.document_id is not None
    async with context.database.session() as session:
        record = await KnowledgeRepository(session).get_document(result.document_id)
    if record is None:
        raise NotFound(
            f"Document {result.document_id!r} does not exist", document_id=result.document_id
        )
    return DocumentRead.from_record(record)


@router.get("/documents", response_model=list[DocumentRead])
async def list_documents(
    context: Context,
    project_id: Annotated[str | None, Query()] = None,
) -> list[DocumentRead]:
    async with context.database.session() as session:
        records = await KnowledgeRepository(session).list_documents(project_id=project_id)
    return [DocumentRead.from_record(record) for record in records]


@router.get("/documents/{document_id}", response_model=DocumentRead)
async def get_document(document_id: str, context: Context) -> DocumentRead:
    async with context.database.session() as session:
        record = await KnowledgeRepository(session).get_document(document_id)
    if record is None:
        raise NotFound(f"Document {document_id!r} does not exist", document_id=document_id)
    return DocumentRead.from_record(record)


@router.get("/documents/{document_id}/chunks", response_model=list[ChunkRead])
async def list_chunks(document_id: str, context: Context) -> list[ChunkRead]:
    """Chunks for a document, in ordinal order."""
    async with context.database.session() as session:
        # Verify document exists
        doc = await KnowledgeRepository(session).get_document(document_id)
        if doc is None:
            raise NotFound(
                f"Document {document_id!r} does not exist", document_id=document_id
            )
        records = await KnowledgeRepository(session).list_chunks(document_id)
    return [ChunkRead.from_record(record) for record in records]


@router.get("/documents/{document_id}/raw")
async def get_raw_document(document_id: str, context: Context) -> FileResponse:
    """Download or stream the raw document content from storage."""
    async with context.database.session() as session:
        record = await KnowledgeRepository(session).get_document(document_id)
    if record is None:
        raise NotFound(f"Document {document_id!r} does not exist", document_id=document_id)
    if not record.storage_path or not Path(record.storage_path).exists():
        raise NotFound(f"Raw file for document {document_id!r} not found on disk", document_id=document_id)
    return FileResponse(
        path=record.storage_path,
        media_type=record.mime or "application/octet-stream",
        filename=record.filename,
    )


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(document_id: str, context: Context) -> None:
    async with context.database.session() as session:
        repository = KnowledgeRepository(session)
        record = await repository.get_document(document_id)
        if record is None:
            raise NotFound(
                f"Document {document_id!r} does not exist", document_id=document_id
            )
        # Remove from vector index if available
        if context.rag_index is not None:
            try:
                await context.rag_index.delete_by_document(document_id)
            except Exception as exc:
                logger.debug("Could not delete vectors for %s: %s", document_id, exc)

        # Remove the stored file if it exists
        if record.storage_path:
            import anyio

            storage = Path(record.storage_path)

            def _cleanup() -> None:
                if storage.exists():
                    storage.unlink(missing_ok=True)
                    if storage.parent.exists() and not any(storage.parent.iterdir()):
                        shutil.rmtree(storage.parent, ignore_errors=True)

            await anyio.to_thread.run_sync(_cleanup)
        await repository.delete_document(record)


@router.post("/search", response_model=SearchResult)
async def search(request: SearchRequest, context: Context) -> SearchResult:
    """Hybrid search over the ingested corpus with source citation tracking."""
    if not context.settings.rag.enabled:
        raise NotImplementedYet(
            "Knowledge search requires the RAG subsystem (VAJRA_RAG__ENABLED=true), "
            "a running Qdrant instance, and an embedding model. "
            "None of these are available in the current configuration.",
            query=request.query,
        )

    from vajra.events.types import EventType
    from vajra.rag.citations import build_citations
    from vajra.rag.models import SearchRequest as RagSearchRequest

    await context.events.emit_event(
        EventType.RAG_QUERY,
        query=request.query,
        top_k=request.top_k,
        document_ids=request.document_ids,
    )

    rag_req = RagSearchRequest(
        query=request.query,
        top_k=request.top_k,
        document_ids=request.document_ids,
        rerank=request.rerank,
    )
    search_result = await context.rag_retriever.search(rag_req)
    citations = build_citations(search_result.chunks)

    output_chunks: list[ChunkCitationResult] = []
    for citation, chunk in zip(citations, search_result.chunks, strict=True):
        output_chunks.append(
            ChunkCitationResult(
                marker=citation.marker,
                label=citation.label,
                chunk_id=chunk.chunk_id,
                document_id=chunk.document_id,
                text=chunk.text,
                page_from=chunk.page_from,
                page_to=chunk.page_to,
                section_path=chunk.section_path,
                doc_title=chunk.doc_title,
                score=chunk.rerank_score if chunk.rerank_score is not None else chunk.dense_score,
            )
        )

    await context.events.emit_event(
        EventType.RAG_RESULTS,
        query=request.query,
        chunk_count=len(output_chunks),
        reranked=search_result.reranked,
        timings=search_result.timings.model_dump(),
    )

    return SearchResult(
        query=search_result.query,
        chunks=output_chunks,
        reranked=search_result.reranked,
        timings=search_result.timings.model_dump(),
    )


# --- knowledge graph (heuristic, not NER) ---------------------------------
#
# Derived from real ingested documents and chunks -- no fabricated entities.
# "Term" nodes come from two cheap, honest regexes (equipment-tag patterns
# like "E-102" or "TI-301", and Title Case multi-word phrases), not from a
# named-entity-recognition model this project does not have. Edges are
# document -> term (a term appeared in that document) and term <-> term
# (two terms co-occurred in the same chunk), both weighted by frequency.
# The graph explicitly reports its own method so the frontend can label it
# honestly rather than imply it is something more than it is.

_EQUIPMENT_TAG = re.compile(r"\b[A-Z]{1,5}-\d{2,4}[A-Z]?\b")
_TITLE_PHRASE = re.compile(r"\b(?:[A-Z][a-zA-Z]{2,}(?:\s+[A-Z][a-zA-Z]{2,}){1,2})\b")
_STOPWORD_PHRASES = frozenset({"The", "This", "That", "These", "Those"})

#: Cap on term nodes returned, so a large corpus still renders a legible graph.
_MAX_TERM_NODES = 60


def _extract_terms(text: str) -> set[str]:
    terms = set(_EQUIPMENT_TAG.findall(text))
    terms |= {
        phrase
        for phrase in _TITLE_PHRASE.findall(text)
        if phrase.split()[0] not in _STOPWORD_PHRASES
    }
    return terms


class GraphNode(BaseModel):
    id: str
    label: str
    kind: Literal["document", "term"]
    weight: int


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    weight: int


class KnowledgeGraphResponse(BaseModel):
    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)
    documents_indexed: int
    method: str = (
        "Heuristic term extraction (equipment-tag and Title-Case-phrase regexes) "
        "and co-occurrence counting over indexed chunk text. Not named-entity "
        "recognition; a term node is a recurring token pattern, not a verified entity."
    )


@router.get("/graph", response_model=KnowledgeGraphResponse)
async def knowledge_graph(
    context: Context,
    limit_documents: Annotated[int, Query(ge=1, le=200)] = 50,
) -> KnowledgeGraphResponse:
    """A real, heuristic co-occurrence graph over ingested documents.

    No entity is invented: every node traces to an actual document or a
    pattern match against actual chunk text, and every edge count is a real
    tally, not a plausible-looking placeholder.
    """
    async with context.database.session() as session:
        documents = await KnowledgeRepository(session).list_documents()
    indexed = [d for d in documents if d.status == DocumentStatus.INDEXED][:limit_documents]

    doc_nodes: dict[str, GraphNode] = {}
    term_counts: Counter[str] = Counter()
    doc_term_counts: dict[tuple[str, str], int] = defaultdict(int)
    term_cooccurrence: dict[tuple[str, str], int] = defaultdict(int)

    async with context.database.session() as session:
        repository = KnowledgeRepository(session)
        for document in indexed:
            chunks = await repository.list_chunks(document.id)
            doc_nodes[document.id] = GraphNode(
                id=f"doc:{document.id}",
                label=document.filename,
                kind="document",
                weight=len(chunks),
            )
            for chunk in chunks:
                terms = _extract_terms(chunk.text)
                for term in terms:
                    term_counts[term] += 1
                    doc_term_counts[(document.id, term)] += 1
                for a, b in itertools.combinations(sorted(terms), 2):
                    term_cooccurrence[(a, b)] += 1

    top_terms = [term for term, _ in term_counts.most_common(_MAX_TERM_NODES)]
    top_term_set = set(top_terms)

    nodes: list[GraphNode] = list(doc_nodes.values())
    nodes += [
        GraphNode(id=f"term:{term}", label=term, kind="term", weight=term_counts[term])
        for term in top_terms
    ]

    edges: list[GraphEdge] = []
    for (document_id, term), weight in doc_term_counts.items():
        if term not in top_term_set:
            continue
        edges.append(
            GraphEdge(
                id=f"dt:{document_id}:{term}",
                source=f"doc:{document_id}",
                target=f"term:{term}",
                weight=weight,
            )
        )
    for (a, b), weight in term_cooccurrence.items():
        if a not in top_term_set or b not in top_term_set:
            continue
        edges.append(
            GraphEdge(id=f"tt:{a}:{b}", source=f"term:{a}", target=f"term:{b}", weight=weight)
        )

    return KnowledgeGraphResponse(nodes=nodes, edges=edges, documents_indexed=len(indexed))
