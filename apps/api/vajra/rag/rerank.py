"""Cross-encoder reranking (Section G, "Reranking").

``bge-reranker-v2-m3`` over the fused top-20, returning top-5, on CPU in the
process pool. Shipped behind a feature flag so it can be disabled if the venue
machine is slow (``VAJRA_RAG__RERANK_ENABLED=false``).

Not implemented. Returning the input order and calling it "reranked" would be a
fabricated score, so it raises instead.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol

from vajra.core.exceptions import InfrastructureUnavailable, NotImplementedYet
from vajra.rag.models import RetrievedChunk


class Reranker(Protocol):
    model: str

    async def rerank(
        self, query: str, chunks: Sequence[RetrievedChunk], *, top_k: int
    ) -> list[RetrievedChunk]: ...


class CrossEncoderReranker:
    """FastEmbed cross-encoder reranker on CPU."""

    def __init__(self, model: str = "bge-reranker-v2-m3") -> None:
        self.model = model

    async def rerank(
        self, query: str, chunks: Sequence[RetrievedChunk], *, top_k: int
    ) -> list[RetrievedChunk]:
        try:
            import fastembed  # noqa: F401 - optional dependency probe
        except ImportError as exc:
            raise InfrastructureUnavailable(
                "fastembed is not installed. Install the 'rag' extra to enable reranking.",
                extra="rag",
            ) from exc
        raise NotImplementedYet(
            "Cross-encoder reranking is not implemented. It must score every "
            "(query, chunk) pair with the cross-encoder and set RetrievedChunk.rerank_score.",
            model=self.model,
            candidates=len(chunks),
            top_k=top_k,
        )
