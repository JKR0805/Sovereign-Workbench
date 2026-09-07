"""Retrieval-augmented generation.

Section G. Chunking and citation assembly are implemented; parsing, embedding,
indexing, retrieval and reranking are scaffolded behind protocols and raise
explicitly rather than returning fabricated results.
"""

from vajra.rag.chunk import StructureAwareChunker, estimate_tokens
from vajra.rag.citations import Citation, build_citations, render_context
from vajra.rag.index import QdrantIndex, assert_cloud_inference_disabled
from vajra.rag.models import (
    BBox,
    Block,
    BlockType,
    Chunk,
    ExtractedDocument,
    PageClassification,
    PageKind,
    RetrievedChunk,
    SearchRequest,
    SearchResult,
)

__all__ = [
    "BBox",
    "Block",
    "BlockType",
    "Chunk",
    "Citation",
    "ExtractedDocument",
    "PageClassification",
    "PageKind",
    "QdrantIndex",
    "RetrievedChunk",
    "SearchRequest",
    "SearchResult",
    "StructureAwareChunker",
    "assert_cloud_inference_disabled",
    "build_citations",
    "estimate_tokens",
    "render_context",
]
