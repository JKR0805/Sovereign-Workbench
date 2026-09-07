"""PDF renderer.

Not implemented. Implementing it means reportlab with a platypus story built
from the same block list the DOCX renderer consumes, so both formats stay
driven by one ArtifactSpec.
"""

from __future__ import annotations

from pathlib import Path

from vajra.artifacts.models import ArtifactSpec, RendererStatus
from vajra.core.enums import ArtifactKind
from vajra.core.exceptions import NotImplementedYet

MIME = "application/pdf"


class PdfRenderer:
    kind = ArtifactKind.PDF
    mime = MIME

    def status(self) -> RendererStatus:
        return RendererStatus(
            kind=self.kind,
            available=False,
            detail="not implemented: requires a reportlab story builder",
        )

    def render(self, spec: ArtifactSpec, destination: Path) -> Path:
        raise NotImplementedYet(
            "PDF rendering is not implemented.", filename=spec.filename
        )
