"""XLSX renderer.

Not implemented. Section P places "XLSX generation with a chart" in the
should-build tier; the interface exists so the manager can register it and the
Tools page can show its real status.

Implementing it means openpyxl: a sheet per table block, a header row, and a
BarChart or LineChart anchored beside the data.
"""

from __future__ import annotations

from pathlib import Path

from vajra.artifacts.models import ArtifactSpec, RendererStatus
from vajra.core.enums import ArtifactKind
from vajra.core.exceptions import NotImplementedYet

MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


class XlsxRenderer:
    kind = ArtifactKind.XLSX
    mime = MIME

    def status(self) -> RendererStatus:
        return RendererStatus(
            kind=self.kind,
            available=False,
            detail="not implemented: requires openpyxl sheet and chart rendering",
        )

    def render(self, spec: ArtifactSpec, destination: Path) -> Path:
        raise NotImplementedYet(
            "XLSX rendering is not implemented. Writing an empty workbook and reporting "
            "success would be a fabricated artifact.",
            filename=spec.filename,
        )
