"""Parsing and page classification (Sections G and I).

Supports:
- Digital and scanned PDF analysis with PyMuPDF
- Page classification (DIGITAL vs SCANNED) via text-layer area coverage probe
- Markdown, plain text, and CSV direct structured parsing
"""

from __future__ import annotations

import csv
import io
import re
from pathlib import Path
from typing import Protocol

from vajra.core.exceptions import InfrastructureUnavailable, NotImplementedYet
from vajra.rag.models import BBox, Block, BlockType, ExtractedDocument, PageClassification, PageKind

HEADING_PATTERN = re.compile(r"^(#{1,6})\s+(.+)$")
BULLET_PREFIX_PATTERN = re.compile(r"^[\s\u2022\u25cf\u25cb\ufffd\u25aa\u25b6\-\*·▪▫►–—\d+\.\)]+\s*")

#: A markdown table row: at least one pipe with content on both sides.
TABLE_ROW_PATTERN = re.compile(r"^\s*\|.+\|\s*$")
#: The separator row that confirms the block above it is a table header, e.g.
#: ``| --- | :---: | ---: |``.
TABLE_SEPARATOR_PATTERN = re.compile(r"^\s*\|?(\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?\s*$")

#: CSV rows per emitted table block. Section G packs a table into one chunk with
#: its heading prepended; an unbounded block for a large CSV would defeat that
#: -- one row per line of the target token budget keeps blocks retrieval-sized.
CSV_ROWS_PER_BLOCK = 40


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


import base64


class PyMuPDFParser:
    """Extracts structured blocks and page classifications from PDFs, DOCX, CSV, Excel, TXT, MD."""

    name = "pymupdf"

    def __init__(self, coverage_threshold: float = 0.15) -> None:
        self._classifier = PageClassifier(coverage_threshold=coverage_threshold)

    async def parse(self, path: Path, *, document_id: str, title: str) -> ExtractedDocument:
        suffix = path.suffix.lower()

        if suffix == ".pdf":
            return await self._parse_pdf(path, document_id=document_id, title=title)
        if suffix in (".csv", ".tsv", ".xlsx", ".xls"):
            return await self._parse_tabular(path, document_id=document_id, title=title)
        if suffix == ".docx":
            return await self._parse_docx(path, document_id=document_id, title=title)
        if suffix in (".txt", ".md", ".json", ".log", ".py", ".yaml", ".yml", ".sh", ".sql"):
            return await self._parse_text(path, document_id=document_id, title=title)
        raise ValueError(
            f"Unsupported document format: '{suffix}'. "
            "Supported formats: .pdf, .docx, .csv, .xlsx, .xls, .tsv, .txt, .md, .json, .log, .py, .yaml, .yml, .sh, .sql"
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

                # Extract text blocks
                for b in raw_blocks:
                    if len(b) < 5:
                        continue
                    text = b[4].strip()
                    if not text:
                        continue

                    lines = text.splitlines()
                    first_line = lines[0].strip() if lines else ""
                    is_bullet = bool(BULLET_PREFIX_PATTERN.match(first_line))
                    is_heading = (
                        len(lines) == 1
                        and 3 < len(first_line) < 80
                        and not first_line.endswith((".", ":", ";", ",", "|", "-"))
                        and not is_bullet
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

                # Extract structured tables via PyMuPDF TableFinder
                try:
                    tabs = page.find_tables()
                    for t in getattr(tabs, "tables", []):
                        grid = t.extract()
                        if grid and len(grid) > 1:
                            clean_rows = [
                                [str(c or "").replace("\n", " ").strip() for c in row]
                                for row in grid
                            ]
                            if any(any(c for c in row) for row in clean_rows):
                                blocks.append(
                                    Block(
                                        text=_render_markdown_table(clean_rows),
                                        type=BlockType.TABLE,
                                        page=page_num,
                                    )
                                )
                except Exception:
                    pass

            total_chars = sum(len(b.text) for b in blocks)
            scanned_count = sum(1 for p in pages if p.kind == PageKind.SCANNED)
            fallback_images: list[str] = []

            # Quality check: If scanned pages exist or text is sparse, render images for multimodal fallback
            if scanned_count > 0 or (len(doc) > 0 and total_chars < 50):
                for page_idx in range(min(len(doc), 5)):
                    try:
                        pix = doc[page_idx].get_pixmap(dpi=150)
                        fallback_images.append(
                            base64.b64encode(pix.tobytes("png")).decode("ascii")
                        )
                    except Exception:
                        pass
        finally:
            doc.close()

        summary = (
            f"PDF Document: {len(pages)} pages ({scanned_count} scanned), "
            f"{len(blocks)} blocks extracted, {total_chars} characters."
        )

        return ExtractedDocument(
            document_id=document_id,
            title=title,
            blocks=blocks,
            pages=pages,
            parser=self.name,
            summary=summary,
            fallback_images=fallback_images,
            metadata={"pages": len(pages), "scanned_pages": scanned_count, "chars": total_chars},
        )

    async def _parse_tabular(self, path: Path, *, document_id: str, title: str) -> ExtractedDocument:
        import anyio
        import csv

        suffix = path.suffix.lower()

        def _read_data() -> tuple[list[str], list[list[str]], str, str]:
            try:
                import pandas as pd

                if suffix in (".xlsx", ".xls"):
                    df = pd.read_excel(path)
                elif suffix == ".tsv":
                    df = pd.read_csv(path, sep="\t")
                else:
                    df = pd.read_csv(path)

                header = [str(c) for c in df.columns]
                rows = [[str(val) for val in row] for row in df.values]
                schema_items = [f"{col} ({dtype})" for col, dtype in zip(df.columns, df.dtypes)]
                schema_str = ", ".join(schema_items)
                try:
                    stats_str = df.describe(include="all").fillna("").to_string()
                except Exception:
                    stats_str = "Statistics calculation not applicable for non-numeric data."
                return header, rows, schema_str, stats_str
            except ImportError:
                delimiter = "\t" if suffix == ".tsv" else ","
                with path.open("r", encoding="utf-8", errors="replace") as f:
                    reader = list(csv.reader(f, delimiter=delimiter))
                if not reader:
                    return [], [], "empty", "No data"
                header = [str(c).strip() for c in reader[0]]
                rows = [[str(val).strip() for val in row] for row in reader[1:] if row]
                schema_items = [f"{col} (string)" for col in header]
                schema_str = ", ".join(schema_items)
                stats_str = f"Columns: {len(header)}, Rows: {len(rows)}"
                return header, rows, schema_str, stats_str

        header, rows, schema_str, stats_str = await anyio.to_thread.run_sync(_read_data)

        summary_text = (
            f"### Tabular Schema & Statistics ({path.name})\n"
            f"- **Rows**: {len(rows)}, **Columns**: {len(header)}\n"
            f"- **Schema**: {schema_str}\n"
            f"- **Summary Statistics**:\n```\n{stats_str}\n```"
        )

        blocks: list[Block] = [
            Block(text=summary_text, type=BlockType.PARAGRAPH, page=1)
        ]

        for start in range(0, len(rows), CSV_ROWS_PER_BLOCK):
            batch = rows[start : start + CSV_ROWS_PER_BLOCK]
            blocks.append(
                Block(text=_render_markdown_table([header, *batch]), type=BlockType.TABLE, page=1)
            )

        pages = [PageClassification(page=1, kind=PageKind.DIGITAL, text_coverage=1.0)]
        return ExtractedDocument(
            document_id=document_id,
            title=title,
            blocks=blocks,
            pages=pages,
            parser="tabular",
            summary=f"Tabular file ({len(rows)} rows, {len(header)} columns). Schema: {schema_str}",
            metadata={"rows": len(rows), "columns": len(header), "schema": schema_str},
        )

    async def _parse_docx(self, path: Path, *, document_id: str, title: str) -> ExtractedDocument:
        import anyio
        import docx

        def _extract() -> tuple[list[Block], str]:
            doc = docx.Document(path)
            b_list: list[Block] = []

            for p in doc.paragraphs:
                text = p.text.strip()
                if not text:
                    continue

                style_name = getattr(p.style, "name", "")
                if style_name.startswith("Heading"):
                    try:
                        lvl = int(style_name.split()[-1])
                    except (ValueError, IndexError):
                        lvl = 1
                    b_list.append(Block(text=text, type=BlockType.HEADING, page=1, level=lvl))
                else:
                    b_list.append(Block(text=text, type=BlockType.PARAGRAPH, page=1))

            for table in doc.tables:
                grid: list[list[str]] = []
                for row in table.rows:
                    grid.append([cell.text.replace("\n", " ").strip() for cell in row.cells])
                if grid:
                    b_list.append(Block(text=_render_markdown_table(grid), type=BlockType.TABLE, page=1))

            summary = f"DOCX Document: {len(doc.paragraphs)} paragraphs, {len(doc.tables)} tables."
            return b_list, summary

        blocks, summary = await anyio.to_thread.run_sync(_extract)
        pages = [PageClassification(page=1, kind=PageKind.DIGITAL, text_coverage=1.0)]

        return ExtractedDocument(
            document_id=document_id,
            title=title,
            blocks=blocks,
            pages=pages,
            parser="docx",
            summary=summary,
            metadata={"paragraphs": len(blocks)},
        )

    async def _parse_text(self, path: Path, *, document_id: str, title: str) -> ExtractedDocument:
        import anyio

        text = await anyio.to_thread.run_sync(path.read_text, "utf-8", "replace")
        blocks = _parse_markdown_blocks(text)

        pages = [PageClassification(page=1, kind=PageKind.DIGITAL, text_coverage=1.0)]
        return ExtractedDocument(
            document_id=document_id,
            title=title,
            blocks=blocks,
            pages=pages,
            parser="text",
            summary=f"Text document: {len(blocks)} blocks.",
            metadata={"chars": len(text)},
        )


def _render_markdown_table(rows: list[list[str]]) -> str:
    """Render rows (first row is the header) as a markdown pipe table."""
    lines = ["| " + " | ".join(rows[0]) + " |"]
    lines.append("| " + " | ".join("---" for _ in rows[0]) + " |")
    for row in rows[1:]:
        lines.append("| " + " | ".join(row) + " |")
    return "\n".join(lines)


def _parse_csv_blocks(text: str) -> list[Block]:
    """A CSV becomes a run of TABLE blocks, header repeated every
    :data:`CSV_ROWS_PER_BLOCK` data rows, so each stays retrieval-sized instead
    of one unbounded block the chunker cannot split (Section G: a table stands
    alone as one chunk)."""
    reader = csv.reader(io.StringIO(text))
    rows = [row for row in reader if any(cell.strip() for cell in row)]
    if not rows:
        return []

    header, data_rows = rows[0], rows[1:]
    if not data_rows:
        return [Block(text=_render_markdown_table([header]), type=BlockType.TABLE, page=1)]

    blocks: list[Block] = []
    for start in range(0, len(data_rows), CSV_ROWS_PER_BLOCK):
        batch = data_rows[start : start + CSV_ROWS_PER_BLOCK]
        blocks.append(
            Block(text=_render_markdown_table([header, *batch]), type=BlockType.TABLE, page=1)
        )
    return blocks


def _parse_markdown_blocks(text: str) -> list[Block]:
    """Headings, paragraphs and markdown pipe-tables, in reading order.

    A table is recognised by its separator row (``| --- | --- |``) immediately
    following what looked like a header row, per the CommonMark table
    extension; every contiguous row after that belongs to the same table.
    """
    blocks: list[Block] = []
    lines = text.splitlines()
    current_para: list[str] = []
    i = 0

    def _flush_paragraph() -> None:
        if current_para:
            blocks.append(Block(text="\n".join(current_para), type=BlockType.PARAGRAPH, page=1))
            current_para.clear()

    while i < len(lines):
        trimmed = lines[i].strip()

        if not trimmed:
            _flush_paragraph()
            i += 1
            continue

        if (
            TABLE_ROW_PATTERN.match(trimmed)
            and i + 1 < len(lines)
            and TABLE_SEPARATOR_PATTERN.match(lines[i + 1].strip())
        ):
            _flush_paragraph()
            table_lines = [lines[i], lines[i + 1]]
            j = i + 2
            while j < len(lines) and TABLE_ROW_PATTERN.match(lines[j].strip()):
                table_lines.append(lines[j])
                j += 1
            blocks.append(Block(text="\n".join(table_lines), type=BlockType.TABLE, page=1))
            i = j
            continue

        match = HEADING_PATTERN.match(trimmed)
        if match:
            _flush_paragraph()
            hashes, heading_text = match.groups()
            blocks.append(
                Block(text=heading_text.strip(), type=BlockType.HEADING, page=1, level=len(hashes))
            )
            i += 1
            continue

        current_para.append(trimmed)
        i += 1

    _flush_paragraph()
    return blocks


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
