"""Structure-aware chunking (Section G, "Chunking").

Implemented and complete. It has no external dependencies, it is deterministic,
and it is the one piece of the RAG pipeline that can be finished before the
parser and the embedder exist.

Rules, straight from the plan:

- split on the heading hierarchy first, then pack to ~700 tokens with 15% overlap;
- never cross a section boundary;
- a table becomes one chunk, with its section heading prepended;
- every chunk records ``{section_path, page_from, page_to, bbox[], token_count}``.

Token counts are produced by :func:`estimate_tokens`, which is explicitly an
estimate. The authoritative count for a generation comes from the runtime; this
one exists to size chunks.
"""

from __future__ import annotations

import re
import uuid
from collections.abc import Iterable, Sequence

from vajra.rag.models import BBox, Block, BlockType, Chunk, ExtractedDocument

_WORD = re.compile(r"\S+")

#: Words per token, averaged over English technical prose. An estimate, labelled.
TOKENS_PER_WORD = 1.3


def estimate_tokens(text: str) -> int:
    """Estimate a token count from a word count.

    Named ``estimate`` deliberately. Nothing user-facing presents this as a
    measurement.
    """
    return int(len(_WORD.findall(text)) * TOKENS_PER_WORD)


def _section_path(stack: Sequence[str]) -> str | None:
    return " > ".join(stack) if stack else None


def assign_section_paths(blocks: Iterable[Block]) -> list[Block]:
    """Walk the heading hierarchy and stamp each block with its section path."""
    stack: list[str] = []
    levels: list[int] = []
    result: list[Block] = []

    for block in blocks:
        if block.type is BlockType.HEADING:
            level = block.level or 1
            while levels and levels[-1] >= level:
                levels.pop()
                stack.pop()
            stack.append(block.text.strip())
            levels.append(level)
            result.append(block.model_copy(update={"section_path": _section_path(stack)}))
            continue
        result.append(block.model_copy(update={"section_path": _section_path(stack)}))
    return result


class StructureAwareChunker:
    """Packs blocks into chunks without crossing a section boundary."""

    def __init__(
        self,
        *,
        target_tokens: int = 700,
        overlap_ratio: float = 0.15,
        min_tokens: int = 40,
    ) -> None:
        self._target = target_tokens
        self._overlap_tokens = int(target_tokens * overlap_ratio)
        self._min_tokens = min_tokens

    def chunk(self, document: ExtractedDocument) -> list[Chunk]:
        """Chunk a parsed document. Returns chunks in reading order."""
        blocks = assign_section_paths(document.blocks)
        chunks: list[Chunk] = []
        ordinal = 0

        for section_blocks in self._group_by_section(blocks):
            for payload in self._pack(section_blocks):
                chunks.append(self._build(document, payload, ordinal))
                ordinal += 1
        return chunks

    # --- grouping --------------------------------------------------------

    @staticmethod
    def _group_by_section(blocks: Sequence[Block]) -> list[list[Block]]:
        """Consecutive blocks sharing a section path. Never merged across sections."""
        groups: list[list[Block]] = []
        current: list[Block] = []
        current_path: str | None = object()  # type: ignore[assignment]

        for block in blocks:
            if block.section_path != current_path:
                if current:
                    groups.append(current)
                current = [block]
                current_path = block.section_path
            else:
                current.append(block)
        if current:
            groups.append(current)
        return groups

    # --- packing ---------------------------------------------------------

    def _pack(self, blocks: Sequence[Block]) -> list[list[Block]]:
        """Pack a section's blocks to the token target, tables standing alone."""
        packed: list[list[Block]] = []
        buffer: list[Block] = []
        buffer_tokens = 0

        for block in blocks:
            if block.type is BlockType.TABLE:
                if buffer:
                    packed.append(buffer)
                    buffer, buffer_tokens = [], 0
                packed.append([block])
                continue

            block_tokens = estimate_tokens(block.text)
            if buffer and buffer_tokens + block_tokens > self._target:
                packed.append(buffer)
                buffer = self._overlap_tail(buffer)
                buffer_tokens = sum(estimate_tokens(item.text) for item in buffer)
            buffer.append(block)
            buffer_tokens += block_tokens

        if buffer:
            packed.append(buffer)

        # A trailing fragment below the minimum is folded back into its
        # predecessor rather than indexed as a stub.
        if len(packed) > 1:
            tail_tokens = sum(estimate_tokens(block.text) for block in packed[-1])
            if tail_tokens < self._min_tokens and packed[-2][0].type is not BlockType.TABLE:
                packed[-2] = [*packed[-2], *packed[-1]]
                packed.pop()
        return packed

    def _overlap_tail(self, buffer: Sequence[Block]) -> list[Block]:
        """Trailing blocks worth roughly ``overlap_ratio`` of the target."""
        if self._overlap_tokens <= 0:
            return []
        tail: list[Block] = []
        tokens = 0
        for block in reversed(buffer):
            if block.type is BlockType.HEADING:
                continue
            tail.insert(0, block)
            tokens += estimate_tokens(block.text)
            if tokens >= self._overlap_tokens:
                break
        return tail

    # --- assembly --------------------------------------------------------

    @staticmethod
    def _build(document: ExtractedDocument, blocks: Sequence[Block], ordinal: int) -> Chunk:
        section_path = blocks[0].section_path
        heading = section_path.split(" > ")[-1] if section_path else None

        body = "\n\n".join(block.text.strip() for block in blocks if block.text.strip())
        if blocks[0].type is BlockType.TABLE and heading:
            # Section G: a table chunk carries its section heading.
            body = f"{heading}\n\n{body}"

        pages = [block.page for block in blocks]
        boxes: list[BBox] = [block.bbox for block in blocks if block.bbox is not None]

        return Chunk(
            id=uuid.uuid4().hex,
            document_id=document.document_id,
            ordinal=ordinal,
            text=body,
            section_path=section_path,
            page_from=min(pages) if pages else None,
            page_to=max(pages) if pages else None,
            bbox=boxes,
            token_count=estimate_tokens(body),
            doc_title=document.title,
        )
