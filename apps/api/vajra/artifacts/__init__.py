"""Artifact generation from structured specifications.

DOCX is implemented. XLSX, PPTX and PDF are registered interfaces that raise.
No renderer ever writes a placeholder file and calls it a deliverable.
"""

from vajra.artifacts.docx import DocxRenderer
from vajra.artifacts.manager import ArtifactManager, ArtifactRenderer
from vajra.artifacts.models import (
    Artifact,
    ArtifactSpec,
    BlockKind,
    DocumentBlock,
    RendererStatus,
)
from vajra.artifacts.pdf import PdfRenderer
from vajra.artifacts.pptx import PptxRenderer
from vajra.artifacts.xlsx import XlsxRenderer

__all__ = [
    "Artifact",
    "ArtifactManager",
    "ArtifactRenderer",
    "ArtifactSpec",
    "BlockKind",
    "DocumentBlock",
    "DocxRenderer",
    "PdfRenderer",
    "PptxRenderer",
    "RendererStatus",
    "XlsxRenderer",
]
