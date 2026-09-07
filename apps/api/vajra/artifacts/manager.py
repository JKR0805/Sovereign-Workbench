"""Artifact manager: render a spec, hash the file, persist the record.

Implemented. The hash, the size and the path all come from the file that was
actually written; there is no code path that records an artifact without one
existing on disk.

Renderers are registered per kind. DOCX is complete; XLSX, PPTX and PDF raise.
:meth:`ArtifactManager.renderer_status` reports which is which, so the UI can
grey out what cannot be produced instead of failing at click time.
"""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from pathlib import Path
from typing import Protocol

from vajra.artifacts.docx import DocxRenderer
from vajra.artifacts.models import Artifact, ArtifactSpec, RendererStatus
from vajra.artifacts.pdf import PdfRenderer
from vajra.artifacts.pptx import PptxRenderer
from vajra.artifacts.xlsx import XlsxRenderer
from vajra.core.enums import ArtifactKind
from vajra.core.exceptions import ArtifactError, NotFound
from vajra.events.bus import EventBus
from vajra.events.types import EventType
from vajra.store.database import Database
from vajra.store.models import ArtifactRecord
from vajra.store.repositories.runs import RunRepository


class ArtifactRenderer(Protocol):
    kind: ArtifactKind
    mime: str

    def status(self) -> RendererStatus: ...

    def render(self, spec: ArtifactSpec, destination: Path) -> Path: ...


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(65536), b""):
            digest.update(block)
    return digest.hexdigest()


def _safe_filename(filename: str) -> str:
    """Reject path traversal. Artifacts are written only inside the artifact dir."""
    name = Path(filename).name
    if not name or name in {".", ".."}:
        raise ArtifactError(f"Invalid artifact filename: {filename!r}")
    return name


class ArtifactManager:
    """Renders artifacts and records them."""

    def __init__(
        self,
        *,
        database: Database,
        artifacts_dir: Path,
        events: EventBus | None = None,
        renderers: dict[ArtifactKind, ArtifactRenderer] | None = None,
    ) -> None:
        self._database = database
        self._dir = artifacts_dir
        self._events = events
        self._renderers: dict[ArtifactKind, ArtifactRenderer] = renderers or {
            ArtifactKind.DOCX: DocxRenderer(),
            ArtifactKind.XLSX: XlsxRenderer(),
            ArtifactKind.PPTX: PptxRenderer(),
            ArtifactKind.PDF: PdfRenderer(),
        }

    def renderer_status(self) -> list[RendererStatus]:
        return [renderer.status() for renderer in self._renderers.values()]

    async def render(self, spec: ArtifactSpec, *, run_id: str | None = None) -> Artifact:
        """Render, hash and persist. Emits ``FILE_CREATED`` on success."""
        renderer = self._renderers.get(spec.kind)
        if renderer is None:
            raise NotFound(f"No renderer registered for {spec.kind.value}", kind=spec.kind.value)

        filename = _safe_filename(spec.filename)
        destination = self._dir / (run_id or "adhoc") / filename
        written = renderer.render(spec, destination)

        if not written.exists():
            raise ArtifactError(
                f"Renderer for {spec.kind.value} reported success but wrote no file",
                path=str(written),
            )

        record = ArtifactRecord(
            run_id=run_id,
            kind=spec.kind,
            filename=filename,
            path=str(written),
            size_bytes=written.stat().st_size,
            sha256=_sha256(written),
            mime=renderer.mime,
            created_at=datetime.now(UTC),
        )
        async with self._database.session() as session:
            await RunRepository(session).add_artifact(record)

        artifact = self._to_artifact(record)
        if self._events is not None:
            await self._events.emit_event(
                EventType.FILE_CREATED,
                run_id=run_id,
                artifact_id=artifact.id,
                filename=artifact.filename,
                kind=artifact.kind.value,
                size_bytes=artifact.size_bytes,
                sha256=artifact.sha256,
            )
        return artifact

    async def get(self, artifact_id: str) -> Artifact:
        async with self._database.session() as session:
            record = await RunRepository(session).get_artifact(artifact_id)
        if record is None:
            raise NotFound(f"Artifact {artifact_id!r} does not exist", artifact_id=artifact_id)
        return self._to_artifact(record)

    async def list_for_run(self, run_id: str) -> list[Artifact]:
        async with self._database.session() as session:
            records = await RunRepository(session).list_artifacts(run_id)
        return [self._to_artifact(record) for record in records]

    @staticmethod
    def _to_artifact(record: ArtifactRecord) -> Artifact:
        return Artifact(
            id=record.id,
            run_id=record.run_id,
            kind=record.kind,
            filename=record.filename,
            path=record.path,
            size_bytes=record.size_bytes,
            sha256=record.sha256,
            mime=record.mime,
            created_at=record.created_at,
        )
