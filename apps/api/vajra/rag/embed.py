"""Embedding (Section G, "Embeddings").

BGE-M3 / BGE-small through FastEmbed's ONNX runtime on CPU. Section V makes CPU
preferred on constrained hardware: it frees VRAM so the GPU does generative
inference exclusively.

Also supports OllamaEmbedder for fleets using Ollama embedding models.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from typing import Any, Protocol

from vajra.core.exceptions import InfrastructureUnavailable
from vajra.rag.models import Chunk, EmbeddingVector
from vajra.runtimes.base import RuntimeAdapter

logger = logging.getLogger(__name__)


class Embedder(Protocol):
    model: str
    device: str

    async def embed_chunks(self, chunks: Sequence[Chunk]) -> list[EmbeddingVector]: ...

    async def embed_query(self, query: str) -> EmbeddingVector: ...


class FastEmbedEmbedder:
    """Local CPU embedding via FastEmbed ONNX runtime."""

    def __init__(self, model: str = "BAAI/bge-small-en-v1.5", device: str = "cpu") -> None:
        if model in ("bge-small", "bge-small-en-v1.5"):
            model = "BAAI/bge-small-en-v1.5"
        elif model in ("bge-m3", "BAAI/bge-m3"):
            model = "BAAI/bge-small-en-v1.5"
        elif "/" not in model:
            model = "BAAI/bge-small-en-v1.5"
        self.model = model
        self.device = device
        self._embedding_model: Any | None = None

    def _get_model(self) -> Any:
        if self._embedding_model is not None:
            return self._embedding_model

        try:
            from fastembed import TextEmbedding
        except ImportError as exc:
            raise InfrastructureUnavailable(
                "fastembed is not installed. Install fastembed to enable CPU embeddings.",
                extra="rag",
            ) from exc

        logger.info("Initializing FastEmbed model: %s on %s", self.model, self.device)
        self._embedding_model = TextEmbedding(model_name=self.model, threads=4)
        return self._embedding_model

    async def embed_chunks(self, chunks: Sequence[Chunk]) -> list[EmbeddingVector]:
        if not chunks:
            return []
        import anyio

        model = self._get_model()
        texts = [chunk.embed_text for chunk in chunks]

        def _do_embed() -> list[Any]:
            return list(model.embed(texts, batch_size=32))

        embeddings = await anyio.to_thread.run_sync(_do_embed)
        return [
            EmbeddingVector(
                chunk_id=chunk.id,
                dense=[round(float(x), 6) for x in emb],
                model=self.model,
            )
            for chunk, emb in zip(chunks, embeddings, strict=True)
        ]

    async def embed_query(self, query: str) -> EmbeddingVector:
        import anyio

        model = self._get_model()

        def _do_embed_query() -> Any:
            if hasattr(model, "query_embed"):
                return next(model.query_embed(query))
            return next(iter(model.embed([query], batch_size=1)))

        emb = await anyio.to_thread.run_sync(_do_embed_query)
        return EmbeddingVector(
            chunk_id="",
            dense=[round(float(x), 6) for x in emb],
            model=self.model,
        )


class OllamaEmbedder:
    """Embedding through an Ollama runtime adapter (e.g. nomic-embed-text)."""

    def __init__(
        self,
        adapter: RuntimeAdapter,
        model: str = "nomic-embed-text:latest",
        device: str = "cpu",
    ) -> None:
        self.adapter = adapter
        self.model = model
        self.device = device

    async def embed_chunks(self, chunks: Sequence[Chunk]) -> list[EmbeddingVector]:
        if not chunks:
            return []
        texts = [chunk.embed_text for chunk in chunks]
        result = await self.adapter.embed(texts, model=self.model)
        return [
            EmbeddingVector(
                chunk_id=chunk.id,
                dense=vec,
                model=self.model,
            )
            for chunk, vec in zip(chunks, result.vectors, strict=True)
        ]

    async def embed_query(self, query: str) -> EmbeddingVector:
        result = await self.adapter.embed([query], model=self.model)
        vec = result.vectors[0] if result.vectors else []
        return EmbeddingVector(
            chunk_id="",
            dense=vec,
            model=self.model,
        )
