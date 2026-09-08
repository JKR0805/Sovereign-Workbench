"""Attachment intake: the one path a file takes into the system, whether it
arrived through the knowledge upload endpoint or as a run attachment.

Before this module existed there were two disconnected paths: a knowledge
upload went through :class:`~vajra.rag.ingest.DocumentIngestor`, while a chat
attachment was base64'd straight into ``runs.attachments`` and only ever used
when it happened to be an image -- a PDF attached in chat was stored and then
silently never read. :class:`AttachmentIntake` is what both
``vajra.api.knowledge`` and the run orchestrator call now.

Kind routing is mime-first, extension-second, and never ``bool(data)``. The
defect this replaces treated *any* attachment carrying base64 bytes as an
image, which sent a ``.docx`` to a vision model as if it were a picture.
"""

from __future__ import annotations

import base64
import hashlib
import logging
import mimetypes
from datetime import UTC, datetime
from enum import Enum
from pathlib import Path

from pydantic import BaseModel, Field

from vajra.core.config import Settings
from vajra.core.enums import AttachmentKind, DocumentStatus
from vajra.events.bus import EventBus
from vajra.events.types import EventType
from vajra.rag.ingest import DocumentIngestor
from vajra.rag.models import IngestRequest
from vajra.store.database import Database
from vajra.store.models import DocumentRecord
from vajra.store.repositories.knowledge import KnowledgeRepository

logger = logging.getLogger(__name__)

IMAGE_EXTENSIONS: frozenset[str] = frozenset(
    {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff"}
)
PARSEABLE_EXTENSIONS: frozenset[str] = frozenset(
    {
        ".pdf",
        ".docx",
        ".csv",
        ".xlsx",
        ".xls",
        ".tsv",
        ".txt",
        ".md",
        ".json",
        ".log",
        ".py",
        ".yaml",
        ".yml",
        ".sh",
        ".sql",
    }
)

#: How much of a file to sniff when neither mime nor extension resolves it.
_SNIFF_BYTES = 8192
#: A file this "binary" (by control-character fraction) is not text, whatever
#: its extension claims. ZIP containers (.docx/.xlsx/.pptx) and image bytes
#: both fail this comfortably.
_MAX_CONTROL_FRACTION = 0.01


class IntakeDisposition(str, Enum):
    INDEXED = "indexed"
    DEDUPED = "deduped"
    IMAGE = "image"
    UNSUPPORTED = "unsupported"
    FAILED = "failed"


class IntakeResult(BaseModel):
    document_id: str | None
    filename: str
    mime: str
    size_bytes: int
    sha256: str
    storage_path: str | None
    disposition: IntakeDisposition
    detail: str
    chunk_count: int = 0
    page_count: int | None = None
    scanned_page_count: int | None = None
    extracted_chars: int | None = None
    image_base64: str | None = None
    extracted_summary: str | None = None
    fallback_images: list[str] = Field(default_factory=list)
    requires_multimodal_fallback: bool = False


def _sniff_is_text(content: bytes) -> bool:
    sample = content[:_SNIFF_BYTES]
    if not sample:
        return True
    try:
        decoded = sample.decode("utf-8")
    except UnicodeDecodeError:
        return False
    control = sum(1 for ch in decoded if ord(ch) < 32 and ch not in "\t\n\r")
    return (control / len(decoded)) <= _MAX_CONTROL_FRACTION


class AttachmentIntake:
    """Hash, persist, dedupe, and route a file to the vision model or the RAG
    ingestor. Never both, never neither, and never guessed from byte
    presence alone."""

    def __init__(
        self,
        *,
        database: Database,
        events: EventBus,
        ingestor: DocumentIngestor,
        settings: Settings,
    ) -> None:
        self._database = database
        self._events = events
        self._ingestor = ingestor
        self._settings = settings

    @staticmethod
    def classify_kind(filename: str, mime: str, kind: AttachmentKind) -> AttachmentKind:
        """Resolve an ``AUTO`` kind to ``IMAGE`` or ``DOCUMENT``. Mime first,
        extension second. Never from whether bytes exist -- ``bool(data)`` says
        nothing about a file's type and previously misrouted every non-empty
        non-image attachment as an image."""
        if kind is not AttachmentKind.AUTO:
            return kind
        suffix = Path(filename).suffix.lower()
        if mime.startswith("image/") or suffix in IMAGE_EXTENSIONS:
            return AttachmentKind.IMAGE
        return AttachmentKind.DOCUMENT

    async def intake(
        self,
        content: bytes,
        *,
        filename: str,
        mime: str | None = None,
        project_id: str | None = None,
        run_id: str | None = None,
        kind: AttachmentKind = AttachmentKind.AUTO,
    ) -> IntakeResult:
        sha256 = hashlib.sha256(content).hexdigest()
        resolved_mime = mime or mimetypes.guess_type(filename)[0] or "application/octet-stream"
        resolved_kind = self.classify_kind(filename, resolved_mime, kind)

        storage_path = await self._persist(sha256, filename, content)

        if resolved_kind is AttachmentKind.IMAGE:
            return await self._intake_image(
                content=content,
                filename=filename,
                mime=resolved_mime,
                sha256=sha256,
                storage_path=storage_path,
                project_id=project_id,
            )

        suffix = Path(filename).suffix.lower()
        if suffix not in PARSEABLE_EXTENSIONS and not _sniff_is_text(content):
            await self._record_unsupported(
                sha256=sha256,
                filename=filename,
                mime=resolved_mime,
                size_bytes=len(content),
                storage_path=storage_path,
                project_id=project_id,
            )
            return IntakeResult(
                document_id=None,
                filename=filename,
                mime=resolved_mime,
                size_bytes=len(content),
                sha256=sha256,
                storage_path=str(storage_path),
                disposition=IntakeDisposition.UNSUPPORTED,
                detail=(
                    f"Unsupported document format: '{suffix or '(none)'}'. "
                    "Supported: .pdf, .txt, .md, .csv, .json, .log, or plain text."
                ),
            )

        existing = await self._get_by_sha(sha256)
        if existing is not None and existing.status == DocumentStatus.INDEXED:
            char_count = await self._char_count(existing.id)
            return IntakeResult(
                document_id=existing.id,
                filename=existing.filename,
                mime=existing.mime,
                size_bytes=existing.size_bytes,
                sha256=existing.sha256,
                storage_path=existing.storage_path,
                disposition=IntakeDisposition.DEDUPED,
                detail=f"Already indexed as {existing.filename!r}; reused.",
                page_count=existing.page_count,
                scanned_page_count=existing.scanned_page_count,
                extracted_chars=char_count,
            )

        record = existing
        if record is None:
            record = DocumentRecord(
                project_id=project_id,
                filename=filename,
                sha256=sha256,
                mime=resolved_mime,
                size_bytes=len(content),
                storage_path=str(storage_path),
                status=DocumentStatus.PENDING,
                created_at=datetime.now(UTC),
            )
            async with self._database.session() as session:
                await KnowledgeRepository(session).add_document(record)
        else:
            record.error = None

        try:
            result = await self._ingestor.ingest(
                IngestRequest(
                    document_id=record.id,
                    filename=filename,
                    storage_path=str(storage_path),
                    mime=resolved_mime,
                    project_id=project_id,
                    run_id=run_id,
                ),
                record=record,
            )
        except Exception as exc:
            logger.warning("attachment ingestion failed for %s: %s", filename, exc)
            return IntakeResult(
                document_id=record.id,
                filename=filename,
                mime=resolved_mime,
                size_bytes=len(content),
                sha256=sha256,
                storage_path=str(storage_path),
                disposition=IntakeDisposition.FAILED,
                detail=f"Ingestion failed: {exc}",
            )

        requires_fallback = bool(result.fallback_images) or (result.scanned_page_count or 0) > 0
        return IntakeResult(
            document_id=record.id,
            filename=filename,
            mime=resolved_mime,
            size_bytes=len(content),
            sha256=sha256,
            storage_path=str(storage_path),
            disposition=IntakeDisposition.INDEXED,
            detail=f"Parsed, chunked and indexed: {result.chunk_count} chunk(s).",
            chunk_count=result.chunk_count,
            page_count=result.page_count,
            scanned_page_count=result.scanned_page_count,
            extracted_chars=await self._char_count(record.id),
            extracted_summary=result.extracted_summary,
            fallback_images=result.fallback_images,
            requires_multimodal_fallback=requires_fallback,
        )

    async def intake_existing(
        self, document_id: str, *, run_id: str | None = None
    ) -> IntakeResult:
        """A file already uploaded through ``POST /api/knowledge/documents``.
        This is preferred path A: no bytes travel a second time."""
        async with self._database.session() as session:
            record = await KnowledgeRepository(session).get_document(document_id)
        if record is None:
            return IntakeResult(
                document_id=document_id,
                filename="(unknown)",
                mime="application/octet-stream",
                size_bytes=0,
                sha256="",
                storage_path=None,
                disposition=IntakeDisposition.FAILED,
                detail=f"Document {document_id!r} does not exist.",
            )
        if record.status == DocumentStatus.INDEXED:
            char_count = await self._char_count(record.id)
            return IntakeResult(
                document_id=record.id,
                filename=record.filename,
                mime=record.mime,
                size_bytes=record.size_bytes,
                sha256=record.sha256,
                storage_path=record.storage_path,
                disposition=IntakeDisposition.DEDUPED,
                detail="Already indexed.",
                page_count=record.page_count,
                scanned_page_count=record.scanned_page_count,
                extracted_chars=char_count,
            )
        if record.status == DocumentStatus.FAILED or record.storage_path is None:
            return IntakeResult(
                document_id=record.id,
                filename=record.filename,
                mime=record.mime,
                size_bytes=record.size_bytes,
                sha256=record.sha256,
                storage_path=record.storage_path,
                disposition=IntakeDisposition.FAILED,
                detail=record.error or "Document ingestion previously failed.",
            )
        # PENDING/PARSING/CHUNKING/EMBEDDING: ingestion is mid-flight (from the
        # knowledge upload path). Report it as-is rather than double-ingesting.
        return IntakeResult(
            document_id=record.id,
            filename=record.filename,
            mime=record.mime,
            size_bytes=record.size_bytes,
            sha256=record.sha256,
            storage_path=record.storage_path,
            disposition=IntakeDisposition.FAILED,
            detail=f"Document is still {record.status.value}; not yet retrievable.",
        )

    # --- internals -----------------------------------------------------

    async def _persist(self, sha256: str, filename: str, content: bytes) -> Path:
        paths = self._settings.paths.resolved()
        assert paths.uploads_dir is not None
        upload_dir = paths.uploads_dir / sha256
        upload_dir.mkdir(parents=True, exist_ok=True)
        dest = upload_dir / filename
        if not (dest.exists() and dest.stat().st_size == len(content)):
            dest.write_bytes(content)
        return dest

    async def _get_by_sha(self, sha256: str) -> DocumentRecord | None:
        async with self._database.session() as session:
            return await KnowledgeRepository(session).get_document_by_sha256(sha256)

    async def _char_count(self, document_id: str) -> int:
        async with self._database.session() as session:
            return await KnowledgeRepository(session).document_char_count(document_id)

    async def _intake_image(
        self,
        *,
        content: bytes,
        filename: str,
        mime: str,
        sha256: str,
        storage_path: Path,
        project_id: str | None,
    ) -> IntakeResult:
        existing = await self._get_by_sha(sha256)
        if existing is None:
            record = DocumentRecord(
                project_id=project_id,
                filename=filename,
                sha256=sha256,
                mime=mime,
                size_bytes=len(content),
                storage_path=str(storage_path),
                status=DocumentStatus.SKIPPED,
                error="image attachment: routed to the vision model, not indexed",
                created_at=datetime.now(UTC),
            )
            async with self._database.session() as session:
                await KnowledgeRepository(session).add_document(record)
            document_id = record.id
        else:
            document_id = existing.id

        return IntakeResult(
            document_id=document_id,
            filename=filename,
            mime=mime,
            size_bytes=len(content),
            sha256=sha256,
            storage_path=str(storage_path),
            disposition=IntakeDisposition.IMAGE,
            detail="Image attachment; sent to the vision model.",
            image_base64=base64.b64encode(content).decode("ascii"),
        )

    async def _record_unsupported(
        self,
        *,
        sha256: str,
        filename: str,
        mime: str,
        size_bytes: int,
        storage_path: Path,
        project_id: str | None,
    ) -> None:
        record = DocumentRecord(
            project_id=project_id,
            filename=filename,
            sha256=sha256,
            mime=mime,
            size_bytes=size_bytes,
            storage_path=str(storage_path),
            status=DocumentStatus.FAILED,
            error=f"Unsupported document format: '{Path(filename).suffix.lower()}'.",
            created_at=datetime.now(UTC),
        )
        async with self._database.session() as session:
            await KnowledgeRepository(session).add_document(record)
        await self._events.emit_event(
            EventType.ATTACHMENT_SKIPPED,
            document_id=record.id,
            filename=filename,
            mime=mime,
            reason=record.error,
            disposition=IntakeDisposition.UNSUPPORTED.value,
        )
