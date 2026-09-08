"""Document ingestion pipeline (Section G).

    document -> parse -> normalize -> chunk -> embed -> index

The orchestration is written here so the shape of the pipeline is fixed and each
stage can be filled in independently. Only the chunking stage is implemented; the
others raise from their own modules, so an ingestion attempt fails at the exact
missing stage and says which one it is.

The document *record* is still created and its status persisted, because a failed
ingest that leaves no trace is worse than one the Knowledge Center can show as
FAILED with a reason.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from vajra.core.config import RagSettings
from vajra.core.enums import DocumentStatus
from vajra.events.bus import EventBus
from vajra.events.types import EventType
from vajra.rag.chunk import StructureAwareChunker
from vajra.rag.embed import Embedder
from vajra.rag.index import VectorIndex
from vajra.rag.models import Chunk, ExtractedDocument, IngestRequest, IngestResult
from vajra.rag.parse import Parser
from vajra.store.database import Database
from vajra.store.models import ChunkRecord, DocumentRecord
from vajra.store.repositories.knowledge import KnowledgeRepository


class DocumentIngestor:
    """Runs a document through parse, chunk, embed and index."""

    def __init__(
        self,
        *,
        database: Database,
        events: EventBus,
        parser: Parser,
        embedder: Embedder,
        index: VectorIndex,
        settings: RagSettings | None = None,
    ) -> None:
        self._database = database
        self._events = events
        self._parser = parser
        self._embedder = embedder
        self._index = index
        self._settings = settings or RagSettings()
        self._chunker = StructureAwareChunker(
            target_tokens=self._settings.chunk_target_tokens,
            overlap_ratio=self._settings.chunk_overlap_ratio,
        )

    async def ingest(self, request: IngestRequest, record: DocumentRecord) -> IngestResult:
        """Ingest one document, emitting progress events as it goes."""
        try:
            await self._set_status(record.id, DocumentStatus.PARSING)
            extracted = await self._parser.parse(
                Path(request.storage_path), document_id=record.id, title=request.filename
            )
            for page in extracted.pages:
                await self._events.emit_event(
                    EventType.PAGE_CLASSIFIED,
                    run_id=request.run_id,
                    document_id=record.id,
                    page=page.page,
                    kind=page.kind.value,
                    text_coverage=page.text_coverage,
                )

            await self._set_status(record.id, DocumentStatus.CHUNKING)
            chunks = self.chunk(extracted)
            await self._persist_chunks(chunks)

            await self._set_status(record.id, DocumentStatus.EMBEDDING)
            vectors = await self._embedder.embed_chunks(chunks)
            await self._index.upsert(chunks, vectors)

            ingested_at = datetime.now(UTC)
            await self._finalise(record.id, extracted, ingested_at)

            await self._events.emit_event(
                EventType.DOCUMENT_INGESTED,
                run_id=request.run_id,
                document_id=record.id,
                filename=request.filename,
                chunk_count=len(chunks),
                page_count=len(extracted.pages),
                scanned_page_count=extracted.scanned_page_count,
                parser=extracted.parser,
            )
            return IngestResult(
                document_id=record.id,
                chunk_count=len(chunks),
                page_count=len(extracted.pages),
                scanned_page_count=extracted.scanned_page_count,
                parser=extracted.parser,
                ingested_at=ingested_at,
                extracted_summary=extracted.summary,
                fallback_images=extracted.fallback_images,
            )
        except Exception as exc:
            await self._set_failed(record.id, str(exc))
            raise

    def chunk(self, extracted: ExtractedDocument) -> list[Chunk]:
        """The one implemented stage. Exposed so it can be used on its own."""
        return self._chunker.chunk(extracted)

    # --- persistence -----------------------------------------------------

    async def _set_status(self, document_id: str, status: DocumentStatus) -> None:
        async with self._database.session() as session:
            repository = KnowledgeRepository(session)
            record = await repository.get_document(document_id)
            if record is not None:
                record.status = status
                await repository.add_document(record)

    async def _set_failed(self, document_id: str, error: str) -> None:
        async with self._database.session() as session:
            repository = KnowledgeRepository(session)
            record = await repository.get_document(document_id)
            if record is not None:
                record.status = DocumentStatus.FAILED
                record.error = error
                await repository.add_document(record)

    async def _persist_chunks(self, chunks: list[Chunk]) -> None:
        records = [
            ChunkRecord(
                id=chunk.id,
                document_id=chunk.document_id,
                ordinal=chunk.ordinal,
                text=chunk.text,
                section_path=chunk.section_path,
                page_from=chunk.page_from,
                page_to=chunk.page_to,
                bbox=[box.model_dump() for box in chunk.bbox],
                token_count=chunk.token_count,
            )
            for chunk in chunks
        ]
        async with self._database.session() as session:
            await KnowledgeRepository(session).add_chunks(records)

    async def _finalise(
        self, document_id: str, extracted: ExtractedDocument, ingested_at: datetime
    ) -> None:
        async with self._database.session() as session:
            repository = KnowledgeRepository(session)
            record = await repository.get_document(document_id)
            if record is None:
                return
            record.status = DocumentStatus.INDEXED
            record.parser = extracted.parser
            record.page_count = len(extracted.pages)
            record.scanned_page_count = extracted.scanned_page_count
            record.ingested_at = ingested_at
            await repository.add_document(record)
