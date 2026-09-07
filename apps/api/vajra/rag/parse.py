"""Parsing and page classification (Sections G and I).

Supports:
- Digital and scanned PDF analysis with PyMuPDF
- Page classification (DIGITAL vs SCANNED) via text-layer area coverage probe
- Markdown, plain text, and CSV direct structured parsing
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Protocol

from vajra.core.exceptions import InfrastructureUnavailable, NotImplementedYet
from vajra.rag.models import BBox, Block, BlockType, ExtractedDocument, PageClassification, PageKind

HEADING_PATTERN = re.compile(r"^(#{1,6})\s+(.+)$")


class Parser(Protocol):
    name: str

    async def parse(self, path: Path, *, document_id: str, title: str) -> ExtractedDocument: ...


class PageClassifier:
    """Text-layer coverage probe. Decides DIGITAL vs SCANNED per page (Section I)."""

    def __init__(self, coverage_threshold: float = 0.15) -> None:
        self._threshold = coverage_threshold

    async def classify(self, path: Path) -> list[PageClassification]:
        try:
            import pymupdf
        except ImportError as exc:
            raise InfrastructureUnavailable(
                "PyMuPDF is not installed. Install pymupdf to enable PDF page classification.",
                extra="rag",
            ) from exc

        classifications: list[PageClassification] = []
        doc = pymupdf.open(path)
        try:
            for page_idx in range(len(doc)):
                page = doc[page_idx]
                page_area = page.rect.width * page.rect.height
                if page_area <= 0:
                    coverage = 0.0
                else:
                    blocks = page.get_text("blocks")
                    text_area = sum(
                        (b[2] - b[0]) * (b[3] - b[1])
                        for b in blocks
                        if len(b) >= 7 and b[6] == 0  # text block
                    )
                    coverage = min(1.0, text_area / page_area)

                has_images = len(page.get_images()) > 0
                has_text = bool(page.get_text().strip())

                if not has_text:
                    kind = PageKind.SCANNED
                elif has_images and coverage < self._threshold:
                    kind = PageKind.SCANNED
                else:
                    kind = PageKind.DIGITAL

                classifications.append(
                    PageClassification(
                        page=page_idx + 1,
                        kind=kind,
                        text_coverage=round(coverage, 4),
                    )
                )
        finally:
            doc.close()

        return classifications


class PyMuPDFParser:
    """Extracts structured blocks and page classifications from PDFs, TXT, MD, CSV."""

    name = "pymupdf"

    def __init__(self, coverage_threshold: float = 0.15) -> None:
        self._classifier = PageClassifier(coverage_threshold=coverage_threshold)

    async def parse(self, path: Path, *, document_id: str, title: str) -> ExtractedDocument:
        suffix = path.suffix.lower()

        if suffix == ".pdf":
            return await self._parse_pdf(path, document_id=document_id, title=title)
        if suffix in (".txt", ".md", ".csv", ".json", ".log"):
            return await self._parse_text(path, document_id=document_id, title=title)
        raise ValueError(
            f"Unsupported document format: '{suffix}'. "
            "Supported formats: .pdf, .txt, .md, .csv, .json, .log"
        )

    async def _parse_pdf(self, path: Path, *, document_id: str, title: str) -> ExtractedDocument:
        try:
            import pymupdf
        except ImportError as exc:
            raise InfrastructureUnavailable(
                "PyMuPDF is not installed. Install pymupdf to enable PDF parsing.",
                extra="rag",
            ) from exc

        pages = await self._classifier.classify(path)
        blocks: list[Block] = []

        doc = pymupdf.open(path)
        try:
            for page_idx in range(len(doc)):
                page = doc[page_idx]
                page_num = page_idx + 1
                raw_blocks = page.get_text("blocks")

                for b in raw_blocks:
                    # b: (x0, y0, x1, y1, text, block_no, block_type)
                    if len(b) < 5:
                        continue
                    text = b[4].strip()
                    if not text:
                        continue

                    # Classify block kind based on formatting / text structure
                    lines = text.splitlines()
                    first_line = lines[0].strip() if lines else ""
                    is_heading = (
                        len(lines) == 1
                        and len(first_line) < 80
                        and not first_line.endswith((".", ":", ";"))
                    )

                    block_type = BlockType.HEADING if is_heading else BlockType.PARAGRAPH
                    level = 1 if is_heading else None

                    bbox = BBox(
                        page=page_num,
                        x0=round(b[0], 2),
                        y0=round(b[1], 2),
                        x1=round(b[2], 2),
                        y1=round(b[3], 2),
                    )

                    blocks.append(
                        Block(
                            text=text,
                            type=block_type,
                            page=page_num,
                            bbox=bbox,
                            level=level,
                        )
                    )
        finally:
            doc.close()

        return ExtractedDocument(
            document_id=document_id,
            title=title,
            blocks=blocks,
            pages=pages,
            parser=self.name,
        )

    async def _parse_text(self, path: Path, *, document_id: str, title: str) -> ExtractedDocument:
        import anyio

        text = await anyio.to_thread.run_sync(path.read_text, "utf-8", "replace")
        blocks: list[Block] = []

        lines = text.splitlines()
        current_para: list[str] = []

        for line in lines:
            trimmed = line.strip()
            if not trimmed:
                if current_para:
                    blocks.append(
                        Block(text="\n".join(current_para), type=BlockType.PARAGRAPH, page=1)
                    )
                    current_para = []
                continue

            match = HEADING_PATTERN.match(trimmed)
            if match:
                if current_para:
                    blocks.append(
                        Block(text="\n".join(current_para), type=BlockType.PARAGRAPH, page=1)
                    )
                    current_para = []
                hashes, heading_text = match.groups()
                blocks.append(
                    Block(
                        text=heading_text.strip(),
                        type=BlockType.HEADING,
                        page=1,
                        level=len(hashes),
                    )
                )
            else:
                current_para.append(trimmed)

        if current_para:
            blocks.append(
                Block(text="\n".join(current_para), type=BlockType.PARAGRAPH, page=1)
            )

        pages = [PageClassification(page=1, kind=PageKind.DIGITAL, text_coverage=1.0)]
        return ExtractedDocument(
            document_id=document_id,
            title=title,
            blocks=blocks,
            pages=pages,
            parser="text",
        )


class DoclingParser:
    """Structured parse via Docling."""

    name = "docling"

    async def parse(self, path: Path, *, document_id: str, title: str) -> ExtractedDocument:
        try:
            import docling  # noqa: F401 - optional dependency probe
        except ImportError as exc:
            raise InfrastructureUnavailable(
                "Docling is not installed. Install the 'rag' extra to enable parsing.",
                extra="rag",
            ) from exc
        raise NotImplementedYet(
            "Docling parsing is not implemented. It must convert the document, walk the "
            "DoclingDocument, and emit normalised Blocks with page and bbox provenance.",
            path=str(path),
            document_id=document_id,
        )
