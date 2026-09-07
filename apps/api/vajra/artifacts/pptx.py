"""PPTX renderer.

Not implemented. Section P: "PPTX and PDF artifacts: one template each" is
scoped-down work. Implementing it means python-pptx with a single title-and-body
layout driven by the heading and paragraph blocks of the spec.
"""

from __future__ import annotations

from pathlib import Path

from vajra.artifacts.models import ArtifactSpec, RendererStatus
from vajra.core.enums import ArtifactKind
from vajra.core.exceptions import NotImplementedYet

MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation"


class PptxRenderer:
    kind = ArtifactKind.PPTX
    mime = MIME

    def status(self) -> RendererStatus:
        return RendererStatus(
            kind=self.kind,
            available=False,
            detail="not implemented: requires a python-pptx template",
        )

    def render(self, spec: ArtifactSpec, destination: Path) -> Path:
        raise NotImplementedYet(
            "PPTX rendering is not implemented.", filename=spec.filename
        )
