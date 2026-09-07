"""Knowledge endpoints (Section M, "Knowledge").

Document upload persists the file and its metadata row. The parsing, chunking and
embedding pipeline is scaffolded: :meth:`ingest` raises
:class:`~vajra.core.exceptions.NotImplementedYet` because it depends on Docling
and Qdrant, which may not be available.

Search similarly raises 501 when the RAG subsystem is disabled. This is
deliberate: a search endpoint that returned an empty result would be
indistinguishable from a query that found nothing, which is exactly the kind of
ambiguity the plan forbids.
"""

from __future__ import annotations

import hashlib
import logging
import shutil
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Query, UploadFile, status
from pydantic import BaseModel, Field

from vajra.core.dependencies import Context
from vajra.core.enums import DocumentStatus
from vajra.core.exceptions import NotFound, NotImplementedYet
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
    """Upload a document. Persists file and metadata, and performs local ingestion."""
    paths = context.settings.paths.resolved()
    assert paths.uploads_dir is not None

    filename = file.filename or "upload"
    suffix = Path(filename).suffix.lower()
    if suffix not in (".pdf", ".txt", ".md", ".csv", ".json", ".log"):
        from fastapi import HTTPException

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Unsupported document format: '{suffix}'. "
                "Supported: .pdf, .txt, .md, .csv, .json, .log"
            ),
        )

    content = await file.read()
    sha256 = hashlib.sha256(content).hexdigest()
    mime = file.content_type or "application/octet-stream"

    # Persist file to data/uploads/<sha256>/<filename>
    upload_dir = paths.uploads_dir / sha256
    upload_dir.mkdir(parents=True, exist_ok=True)
    dest = upload_dir / filename
    dest.write_bytes(content)

    record = DocumentRecord(
        project_id=project_id,
        filename=filename,
        sha256=sha256,
        mime=mime,
        size_bytes=len(content),
        storage_path=str(dest),
        status=DocumentStatus.PENDING,
        created_at=datetime.now(UTC),
    )
    async with context.database.session() as session:
        await KnowledgeRepository(session).add_document(record)

    # Ingest if RAG is enabled
    if context.settings.rag.enabled and context.rag_ingestor is not None:
        from vajra.rag.models import IngestRequest

        try:
            await context.rag_ingestor.ingest(
                IngestRequest(
                    document_id=record.id,
                    filename=filename,
                    storage_path=str(dest),
                    mime=mime,
                ),
                record=record,
            )
            async with context.database.session() as session:
                updated = await KnowledgeRepository(session).get_document(record.id)
                if updated is not None:
                    record = updated
        except Exception:
            # DocumentIngestor marks FAILED and sets error in DB
            async with context.database.session() as session:
                updated = await KnowledgeRepository(session).get_document(record.id)
                if updated is not None:
                    record = updated

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
