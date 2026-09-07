"""Qdrant adapter boundary (Section G, "Retrieval").

Connects to a local Qdrant instance (HTTP or embedded on-disk/in-memory).
Enforces the critical sovereignty rule: cloud_inference must never be True.
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Sequence
from pathlib import Path
from typing import Any, Protocol

from pydantic import BaseModel

from vajra.core.config import QdrantSettings
from vajra.core.exceptions import (
    InfrastructureUnavailable,
    SovereigntyViolation,
)
from vajra.rag.models import Chunk, EmbeddingVector, RetrievedChunk

logger = logging.getLogger(__name__)

#: Named vectors on the collection.
DENSE_VECTOR = "dense"
SPARSE_VECTOR = "bm25_sparse"

#: RRF constant. Section G: "Use RRF, not weighted score blending... Standard k=60."
RRF_K = 60


class IndexHealth(BaseModel):
    available: bool
    detail: str
    url: str
    collection: str
    collection_exists: bool | None = None
    points_count: int | None = None


class VectorIndex(Protocol):
    async def health(self) -> IndexHealth: ...

    async def ensure_collection(self, dimensions: int) -> None: ...

    async def upsert(self, chunks: Sequence[Chunk], vectors: Sequence[EmbeddingVector]) -> None: ...

    async def query(
        self, vector: EmbeddingVector, *, limit: int, document_ids: Sequence[str] = ()
    ) -> list[RetrievedChunk]: ...

    async def delete_by_document(self, document_id: str) -> None: ...


def assert_cloud_inference_disabled(settings: QdrantSettings) -> None:
    """Fail closed if Qdrant cloud inference was ever turned on.

    This is the exact kind of silent egress path that would violate sovereignty.
    """
    if settings.cloud_inference:
        raise SovereigntyViolation(
            "Qdrant cloud_inference is enabled. It sends payloads to a hosted inference "
            "endpoint and is an egress path inside the trust boundary.",
            setting="qdrant.cloud_inference",
        )


class QdrantIndex:
    """Adapter over the Qdrant client."""

    def __init__(self, settings: QdrantSettings) -> None:
        assert_cloud_inference_disabled(settings)
        self._settings = settings
        self._client_instance: Any | None = None

    def _client(self) -> Any:
        if self._client_instance is not None:
            return self._client_instance

        try:
            from qdrant_client import QdrantClient
        except ImportError as exc:
            raise InfrastructureUnavailable(
                "qdrant-client is not installed. Install qdrant-client to enable retrieval.",
                extra="rag",
            ) from exc

        assert_cloud_inference_disabled(self._settings)

        # 1. If an explicit path is configured (e.g. ":memory:" or local folder), use embedded mode
        if self._settings.path is not None:
            target_path = str(self._settings.path)
            if target_path != ":memory:":
                Path(target_path).mkdir(parents=True, exist_ok=True)
            self._client_instance = QdrantClient(path=target_path)
            return self._client_instance

        # 2. Try HTTP connection to local Qdrant server
        try:
            client = QdrantClient(
                url=self._settings.url,
                timeout=int(self._settings.request_timeout_s),
                cloud_inference=False,
                check_compatibility=False,
            )
            # Connectivity probe
            client.get_collections()
            self._client_instance = client
            return self._client_instance
        except Exception as exc:
            logger.info(
                "Qdrant server at %s unreachable (%s); using local embedded Qdrant",
                self._settings.url,
                exc,
            )
            # Fallback to local on-disk embedded Qdrant under data/qdrant
            fallback_dir = Path("data/qdrant")
            fallback_dir.mkdir(parents=True, exist_ok=True)
            self._client_instance = QdrantClient(path=str(fallback_dir))
            return self._client_instance

    async def health(self) -> IndexHealth:
        """Connect and report. Never assumes availability."""
        try:
            client = self._client()
        except InfrastructureUnavailable as exc:
            return IndexHealth(
                available=False,
                detail=exc.detail,
                url=self._settings.url,
                collection=self._settings.collection,
            )
        except Exception as exc:
            return IndexHealth(
                available=False,
                detail=f"Qdrant initialization error: {exc}",
                url=self._settings.url,
                collection=self._settings.collection,
            )

        try:
            collections = client.get_collections()
            names = {c.name for c in collections.collections}
            exists = self._settings.collection in names
            points: int | None = None
            if exists:
                info = client.get_collection(self._settings.collection)
                points = getattr(info, "points_count", None)
        except Exception as exc:
            return IndexHealth(
                available=False,
                detail=f"Qdrant is not reachable: {exc}",
                url=self._settings.url,
                collection=self._settings.collection,
            )

        return IndexHealth(
            available=True,
            detail="Qdrant reachable (local vector store active)",
            url=self._settings.url,
            collection=self._settings.collection,
            collection_exists=exists,
            points_count=points,
        )

    async def ensure_collection(self, dimensions: int) -> None:
        client = self._client()
        from qdrant_client.models import Distance, VectorParams

        collections = client.get_collections().collections
        if not any(c.name == self._settings.collection for c in collections):
            client.create_collection(
                collection_name=self._settings.collection,
                vectors_config=VectorParams(size=dimensions, distance=Distance.COSINE),
            )

    async def upsert(self, chunks: Sequence[Chunk], vectors: Sequence[EmbeddingVector]) -> None:
        if not chunks or not vectors:
            return

        dimensions = len(vectors[0].dense)
        await self.ensure_collection(dimensions)
        client = self._client()
        from qdrant_client.models import PointStruct

        points: list[PointStruct] = []
        for chunk, vector in zip(chunks, vectors, strict=True):
            point_id = uuid.uuid5(uuid.NAMESPACE_DNS, chunk.id).hex
            payload = {
                "chunk_id": chunk.id,
                "document_id": chunk.document_id,
                "ordinal": chunk.ordinal,
                "text": chunk.text,
                "section_path": chunk.section_path,
                "page_from": chunk.page_from,
                "page_to": chunk.page_to,
                "doc_title": chunk.doc_title,
                "token_count": chunk.token_count,
            }
            points.append(
                PointStruct(
                    id=point_id,
                    vector=vector.dense,
                    payload=payload,
                )
            )

        client.upsert(collection_name=self._settings.collection, points=points)

    async def query(
        self, vector: EmbeddingVector, *, limit: int, document_ids: Sequence[str] = ()
    ) -> list[RetrievedChunk]:
        client = self._client()
        from qdrant_client.models import FieldCondition, Filter, MatchAny, MatchValue

        # Check if collection exists
        collections = client.get_collections().collections
        if not any(c.name == self._settings.collection for c in collections):
            return []

        query_filter: Filter | None = None
        if document_ids:
            if len(document_ids) == 1:
                match_val = MatchValue(value=document_ids[0])
                query_filter = Filter(
                    must=[FieldCondition(key="document_id", match=match_val)]
                )
            else:
                match_any = MatchAny(any=list(document_ids))
                query_filter = Filter(
                    must=[FieldCondition(key="document_id", match=match_any)]
                )

        search_result = client.query_points(
            collection_name=self._settings.collection,
            query=vector.dense,
            query_filter=query_filter,
            limit=limit,
        )

        retrieved: list[RetrievedChunk] = []
        for point in search_result.points:
            p = point.payload or {}
            retrieved.append(
                RetrievedChunk(
                    chunk_id=str(p.get("chunk_id", point.id)),
                    document_id=str(p.get("document_id", "")),
                    text=str(p.get("text", "")),
                    section_path=p.get("section_path"),
                    page_from=p.get("page_from"),
                    page_to=p.get("page_to"),
                    doc_title=p.get("doc_title"),
                    dense_score=round(float(point.score), 4),
                )
            )
        return retrieved

    async def delete_by_document(self, document_id: str) -> None:
        client = self._client()
        from qdrant_client.models import FieldCondition, Filter, MatchValue

        collections = client.get_collections().collections
        if not any(c.name == self._settings.collection for c in collections):
            return

        client.delete(
            collection_name=self._settings.collection,
            points_selector=Filter(
                must=[FieldCondition(key="document_id", match=MatchValue(value=document_id))]
            ),
        )
