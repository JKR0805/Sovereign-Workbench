"""Project, document and chunk persistence."""

from __future__ import annotations

from sqlalchemy import delete, func, select

from vajra.store.models import ChunkRecord, DocumentRecord, ProjectRecord

from .base import Repository


class KnowledgeRepository(Repository):
    async def add_project(self, record: ProjectRecord) -> ProjectRecord:
        self.session.add(record)
        await self.session.flush()
        return record

    async def list_projects(self) -> list[ProjectRecord]:
        result = await self.session.execute(select(ProjectRecord).order_by(ProjectRecord.name))
        return list(result.scalars().all())

    async def add_document(self, record: DocumentRecord) -> DocumentRecord:
        self.session.add(record)
        await self.session.flush()
        return record

    async def get_document(self, document_id: str) -> DocumentRecord | None:
        return await self.session.get(DocumentRecord, document_id)

    async def get_document_by_sha256(self, sha256: str) -> DocumentRecord | None:
        """Newest document matching a content hash, or ``None``.

        Backs attachment dedupe: re-attaching a file already ingested reuses
        its ``document_id`` instead of re-parsing, re-chunking and re-embedding
        it.
        """
        statement = (
            select(DocumentRecord)
            .where(DocumentRecord.sha256 == sha256)
            .order_by(DocumentRecord.created_at.desc())
            .limit(1)
        )
        result = await self.session.execute(statement)
        return result.scalars().first()

    async def get_document_by_filename(self, filename: str) -> DocumentRecord | None:
        """Newest document matching a filename, or ``None``."""
        statement = (
            select(DocumentRecord)
            .where(DocumentRecord.filename == filename)
            .order_by(DocumentRecord.created_at.desc())
            .limit(1)
        )
        result = await self.session.execute(statement)
        return result.scalars().first()

    async def document_char_count(self, document_id: str) -> int:
        """Total indexed chunk-text length for a document. Cheap and exact."""
        statement = select(func.coalesce(func.sum(func.length(ChunkRecord.text)), 0)).where(
            ChunkRecord.document_id == document_id
        )
        result = await self.session.execute(statement)
        return int(result.scalar_one())

    async def list_documents(
        self, *, project_id: str | None = None, canonical_only: bool | None = None
    ) -> list[DocumentRecord]:
        statement = select(DocumentRecord)
        if project_id is not None:
            statement = statement.where(DocumentRecord.project_id == project_id)
        if canonical_only is not None:
            statement = statement.where(DocumentRecord.is_canonical.is_(canonical_only))
        statement = statement.order_by(DocumentRecord.created_at.desc())
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def set_canonical(self, document_id: str, is_canonical: bool) -> DocumentRecord | None:
        record = await self.get_document(document_id)
        if record is None:
            return None
        record.is_canonical = is_canonical
        self.session.add(record)
        await self.session.flush()
        return record

    async def delete_document(self, record: DocumentRecord) -> None:
        await self.session.execute(
            delete(ChunkRecord).where(ChunkRecord.document_id == record.id)
        )
        await self.session.delete(record)
        await self.session.flush()

    async def add_chunks(self, records: list[ChunkRecord]) -> list[ChunkRecord]:
        self.session.add_all(records)
        await self.session.flush()
        return records

    async def list_chunks(self, document_id: str) -> list[ChunkRecord]:
        statement = (
            select(ChunkRecord)
            .where(ChunkRecord.document_id == document_id)
            .order_by(ChunkRecord.ordinal)
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def get_chunks_by_ids(self, chunk_ids: list[str]) -> list[ChunkRecord]:
        if not chunk_ids:
            return []
        statement = select(ChunkRecord).where(ChunkRecord.id.in_(chunk_ids))
        result = await self.session.execute(statement)
        return list(result.scalars().all())
