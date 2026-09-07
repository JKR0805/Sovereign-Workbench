"""Citation assembly (Section G, "Citations and grounding").

Turns retrieved chunks into the numbered context block the generation prompt
consumes, and maps a citation marker back to its chunk.

Implemented: the numbering and the mapping, which are pure and deterministic.
The *verification* half lives in :mod:`vajra.agent.verifier`, because it is a
gate in the agent state machine rather than a retrieval concern.
"""

from __future__ import annotations

from collections.abc import Sequence

from pydantic import BaseModel

from vajra.rag.models import RetrievedChunk


class Citation(BaseModel):
    """One numbered source offered to the model."""

    index: int
    chunk_id: str
    document_id: str
    doc_title: str | None = None
    section_path: str | None = None
    page_from: int | None = None
    page_to: int | None = None

    @property
    def marker(self) -> str:
        return f"[C{self.index}]"

    @property
    def label(self) -> str:
        parts = [part for part in (self.doc_title, self.section_path) if part]
        location = (
            f"p.{self.page_from}"
            if self.page_from is not None and self.page_from == self.page_to
            else (
                f"pp.{self.page_from}-{self.page_to}"
                if self.page_from is not None and self.page_to is not None
                else None
            )
        )
        if location:
            parts.append(location)
        return " > ".join(parts) if parts else self.chunk_id


def build_citations(chunks: Sequence[RetrievedChunk]) -> list[Citation]:
    """Number retrieved chunks from 1, in the order they will be presented."""
    return [
        Citation(
            index=index,
            chunk_id=chunk.chunk_id,
            document_id=chunk.document_id,
            doc_title=chunk.doc_title,
            section_path=chunk.section_path,
            page_from=chunk.page_from,
            page_to=chunk.page_to,
        )
        for index, chunk in enumerate(chunks, start=1)
    ]


def render_context(chunks: Sequence[RetrievedChunk]) -> str:
    """Render the numbered context block for the generation prompt."""
    citations = build_citations(chunks)
    blocks = [
        f"{citation.marker} {citation.label}\n{chunk.text}"
        for citation, chunk in zip(citations, chunks, strict=True)
    ]
    return "\n\n---\n\n".join(blocks)


def resolve(citations: Sequence[Citation], index: int) -> Citation | None:
    """Map a citation index back to its source, or ``None`` when it is invented."""
    return next((citation for citation in citations if citation.index == index), None)
