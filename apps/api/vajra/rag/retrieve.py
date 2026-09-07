"""Hybrid retrieval (Section G).

Composes embedder, index and reranker into the search path the
``knowledge.search`` tool and ``POST /api/knowledge/search`` both call.

Not implemented: it delegates to components that are themselves unimplemented,
so it raises from whichever stage fails first. That is deliberate: the error the
caller receives names the exact missing piece rather than an empty result set.
"""

from __future__ import annotations

import time
from typing import Protocol

from vajra.core.config import RagSettings
from vajra.rag.embed import Embedder
from vajra.rag.index import VectorIndex
from vajra.rag.models import SearchRequest, SearchResult, SearchTimings
from vajra.rag.rerank import Reranker


class Retriever(Protocol):
    async def search(self, request: SearchRequest) -> SearchResult: ...


class HybridRetriever:
    """Embed the query, query the index, optionally rerank."""

    def __init__(
        self,
        *,
        embedder: Embedder,
        index: VectorIndex,
        reranker: Reranker | None = None,
        settings: RagSettings | None = None,
    ) -> None:
        self._embedder = embedder
        self._index = index
        self._reranker = reranker
        self._settings = settings or RagSettings()

    async def search(self, request: SearchRequest) -> SearchResult:
        started = time.perf_counter()

        embed_started = time.perf_counter()
        vector = await self._embedder.embed_query(request.query)
        embed_ms = (time.perf_counter() - embed_started) * 1000

        retrieve_started = time.perf_counter()
        chunks = await self._index.query(
            vector,
            limit=self._settings.retrieve_fused_limit,
            document_ids=request.document_ids,
        )
        retrieve_ms = (time.perf_counter() - retrieve_started) * 1000

        rerank_ms: float | None = None
        reranked = False
        if request.rerank and self._reranker is not None and self._settings.rerank_enabled:
            rerank_started = time.perf_counter()
            chunks = await self._reranker.rerank(request.query, chunks, top_k=request.top_k)
            rerank_ms = (time.perf_counter() - rerank_started) * 1000
            reranked = True
        else:
            chunks = chunks[: request.top_k]

        return SearchResult(
            query=request.query,
            chunks=chunks,
            reranked=reranked,
            timings=SearchTimings(
                embed_ms=embed_ms,
                retrieve_ms=retrieve_ms,
                rerank_ms=rerank_ms,
                total_ms=(time.perf_counter() - started) * 1000,
            ),
        )
