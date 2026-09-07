"""Unit tests for RAG pipeline: parsing, chunking, embedding, vector indexing, retrieval, and citations."""

from __future__ import annotations

from pathlib import Path

import pymupdf
import pytest

from vajra.core.config import DatabaseSettings, QdrantSettings, RagSettings
from vajra.core.enums import DocumentStatus
from vajra.core.exceptions import SovereigntyViolation
from vajra.events.bus import EventBus
from vajra.events.store import InMemoryEventStore
from vajra.events.types import EventType
from vajra.rag.chunk import StructureAwareChunker
from vajra.rag.citations import build_citations, render_context
from vajra.rag.embed import FastEmbedEmbedder
from vajra.rag.index import QdrantIndex, assert_cloud_inference_disabled
from vajra.rag.ingest import DocumentIngestor
from vajra.rag.models import (
    Block,
    BlockType,
    Chunk,
    ExtractedDocument,
    IngestRequest,
    PageClassification,
    PageKind,
    RetrievedChunk,
    SearchRequest,
)
from vajra.rag.parse import PageClassifier, PyMuPDFParser
from vajra.rag.retrieve import HybridRetriever
from vajra.store.database import Database
from vajra.store.models import DocumentRecord
from vajra.store.repositories.knowledge import KnowledgeRepository


def create_sample_pdf(path: Path) -> None:
    """Helper to generate a clean 2-page test PDF."""
    doc = pymupdf.open()
    page1 = doc.new_page()
    page1.insert_text(
        (50, 72),
        "Heat Exchanger Inspection Log\n\nEquipment ID: E-102\nMeasured thickness: 6.8 mm.",
        fontsize=12,
    )
    page2 = doc.new_page()
    page2.insert_text(
        (50, 72),
        "Maintenance Criteria\n\nMinimum retirement thickness: 6.4 mm.\nStatus: PASS",
        fontsize=12,
    )
    doc.save(str(path))
    doc.close()


@pytest.mark.asyncio
async def test_parse_text_and_markdown(tmp_path: Path) -> None:
    """PyMuPDFParser handles markdown/text files with headings and paragraphs."""
    parser = PyMuPDFParser()
    md_file = tmp_path / "spec.md"
    md_file.write_text(
        "# Section 1 Overview\nVAJRA operates entirely on-premise.\n\n## Section 2 Storage\nLocal SQLite and Qdrant.",
        encoding="utf-8",
    )

    extracted = await parser.parse(md_file, document_id="doc-md-1", title="Spec")
    assert extracted.document_id == "doc-md-1"
    assert len(extracted.blocks) >= 4
    heading_types = [b.type for b in extracted.blocks if b.type == BlockType.HEADING]
    assert len(heading_types) >= 2


@pytest.mark.asyncio
async def test_parse_pdf_fixture(tmp_path: Path) -> None:
    """PyMuPDFParser extracts pages, text, bounding boxes from PDF."""
    pdf_path = tmp_path / "inspection.pdf"
    create_sample_pdf(pdf_path)

    parser = PyMuPDFParser()
    extracted = await parser.parse(pdf_path, document_id="doc-pdf-1", title="E-102 Inspection")

    assert extracted.document_id == "doc-pdf-1"
    assert len(extracted.pages) == 2
    assert all(p.kind == PageKind.DIGITAL for p in extracted.pages)
    assert any("6.8 mm" in b.text for b in extracted.blocks)
    assert any("6.4 mm" in b.text for b in extracted.blocks)

    # Provenance check: bounding box must exist
    blocks_with_bbox = [b for b in extracted.blocks if b.bbox is not None]
    assert len(blocks_with_bbox) > 0


@pytest.mark.asyncio
async def test_page_classifier_scanned_detection(tmp_path: Path) -> None:
    """Classifier distinguishes text-bearing pages from blank/scanned pages."""
    doc = pymupdf.open()
    # Digital page with text
    p1 = doc.new_page()
    p1.insert_text((50, 72), "Extensive digital text layer here", fontsize=14)
    # Blank / image placeholder page (no text layer)
    _p2 = doc.new_page()

    test_pdf = tmp_path / "mixed.pdf"
    doc.save(str(test_pdf))
    doc.close()

    classifier = PageClassifier(coverage_threshold=0.01)
    classifications = await classifier.classify(test_pdf)

    assert len(classifications) == 2
    assert classifications[0].kind == PageKind.DIGITAL
    assert classifications[0].text_coverage > 0.0
    assert classifications[1].kind == PageKind.SCANNED
    assert classifications[1].text_coverage == 0.0


def test_deterministic_structure_aware_chunking() -> None:
    """StructureAwareChunker chunks document while preserving section path and line numbers."""
    chunker = StructureAwareChunker(target_tokens=50, overlap_ratio=0.1)

    extracted = ExtractedDocument(
        document_id="doc-chunk-test",
        title="Test Document",
        blocks=[
            Block(text="Title Header", type=BlockType.HEADING, level=1, page=1),
            Block(text="Paragraph one detailing mechanical specs.", type=BlockType.PARAGRAPH, page=1),
            Block(text="Paragraph two detailing thermal specs.", type=BlockType.PARAGRAPH, page=2),
        ],
        pages=[PageClassification(page=1, kind=PageKind.DIGITAL, text_coverage=1.0)],
        parser="pymupdf",
    )

    chunks = chunker.chunk(extracted)
    assert len(chunks) > 0
    first_chunk = chunks[0]
    assert first_chunk.document_id == "doc-chunk-test"
    assert first_chunk.page_from == 1
    assert "Title Header" in first_chunk.embed_text


@pytest.mark.asyncio
async def test_fastembed_cpu_embeddings_contract() -> None:
    """FastEmbedEmbedder generates normalized vectors on CPU without touching GPU."""
    embedder = FastEmbedEmbedder(model="BAAI/bge-small-en-v1.5")
    assert embedder.device == "cpu"

    test_chunk = Chunk(
        id="c1",
        document_id="d1",
        ordinal=0,
        text="Heat exchanger E-102 measured thickness: 6.8 mm.",
        page_from=1,
        page_to=1,
        token_count=10,
    )

    vectors = await embedder.embed_chunks([test_chunk])
    assert len(vectors) == 1
    assert vectors[0].chunk_id == "c1"
    assert len(vectors[0].dense) == 384  # bge-small dimension

    query_vec = await embedder.embed_query("E-102 thickness")
    assert len(query_vec.dense) == 384


@pytest.mark.asyncio
async def test_qdrant_index_contract_in_memory() -> None:
    """QdrantIndex correctly ensures collections, upserts, queries, and deletes vectors."""
    index = QdrantIndex(QdrantSettings(path=":memory:", collection="test_collection"))

    health = await index.health()
    assert health.available is True

    embedder = FastEmbedEmbedder()
    chunk1 = Chunk(
        id="ch-1",
        document_id="doc-1",
        ordinal=0,
        text="Turbine T-301 vibration is within normal range.",
        page_from=1,
        page_to=1,
        token_count=8,
    )
    chunk2 = Chunk(
        id="ch-2",
        document_id="doc-2",
        ordinal=0,
        text="Compressor C-104 requires lubricant replacement.",
        page_from=1,
        page_to=1,
        token_count=8,
    )

    vectors = await embedder.embed_chunks([chunk1, chunk2])
    await index.upsert([chunk1, chunk2], vectors)

    # Search for turbine
    query_vec = await embedder.embed_query("What is the vibration status of T-301?")
    results = await index.query(query_vec, limit=5)
    assert len(results) >= 1
    assert results[0].chunk_id == "ch-1"
    assert "T-301" in results[0].text

    # Search with document filter
    filtered = await index.query(query_vec, limit=5, document_ids=["doc-2"])
    assert len(filtered) == 1
    assert filtered[0].chunk_id == "ch-2"

    # Delete doc-1
    await index.delete_by_document("doc-1")
    after_delete = await index.query(query_vec, limit=5, document_ids=["doc-1"])
    assert len(after_delete) == 0


def test_citation_assembly_and_context_rendering() -> None:
    """Citations generate [C1], [C2] markers with proper document and page provenance."""
    chunks = [
        RetrievedChunk(
            chunk_id="chunk-101",
            document_id="doc-inspection",
            text="E-102 measured thickness: 6.8 mm.",
            page_from=1,
            page_to=1,
            doc_title="Inspection Report",
            section_path="Thickness Readings",
            dense_score=0.92,
        ),
        RetrievedChunk(
            chunk_id="chunk-102",
            document_id="doc-inspection",
            text="Minimum retirement thickness: 6.4 mm.",
            page_from=2,
            page_to=2,
            doc_title="Inspection Report",
            section_path="Retirement Thresholds",
            dense_score=0.88,
        ),
    ]

    citations = build_citations(chunks)
    assert len(citations) == 2
    assert citations[0].marker == "[C1]"
    assert citations[0].label == "Inspection Report > Thickness Readings > p.1"
    assert citations[1].marker == "[C2]"
    assert citations[1].label == "Inspection Report > Retirement Thresholds > p.2"

    context = render_context(chunks)
    assert "[C1] Inspection Report > Thickness Readings > p.1" in context
    assert "6.8 mm." in context
    assert "[C2]" in context


def test_sovereignty_guard_rejects_cloud_inference() -> None:
    """assert_cloud_inference_disabled and QdrantSettings enforce that cloud inference is forbidden."""
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        QdrantSettings(cloud_inference=True)

    bad_settings = QdrantSettings.model_construct(cloud_inference=True)
    with pytest.raises(SovereigntyViolation) as exc_info:
        assert_cloud_inference_disabled(bad_settings)
    assert "cloud_inference" in str(exc_info.value)


@pytest.mark.asyncio
async def test_full_rag_ingest_and_retrieval_lifecycle(tmp_path: Path) -> None:
    """Full end-to-end local RAG lifecycle: file -> parse -> chunk -> embed -> index -> retrieve -> citations."""
    db_path = str(tmp_path / "rag_lifecycle.db")
    database = Database(DatabaseSettings(path=db_path))
    await database.init()

    events = EventBus(InMemoryEventStore(), subscriber_queue_size=64, ring_size=32)

    # 1. Create test document
    doc_path = tmp_path / "e102_report.pdf"
    create_sample_pdf(doc_path)

    # 2. Setup components
    parser = PyMuPDFParser()
    embedder = FastEmbedEmbedder()
    index = QdrantIndex(QdrantSettings(path=":memory:", collection="rag_test_lifecycle"))

    ingestor = DocumentIngestor(
        database=database,
        events=events,
        parser=parser,
        embedder=embedder,
        index=index,
    )

    # 3. Create document record in database
    doc_record = DocumentRecord(
        id="doc-e102",
        filename="e102_report.pdf",
        sha256="fake_sha",
        mime="application/pdf",
        size_bytes=doc_path.stat().st_size,
        storage_path=str(doc_path),
        status=DocumentStatus.PENDING,
    )
    async with database.session() as session:
        await KnowledgeRepository(session).add_document(doc_record)

    # 4. Ingest document
    result = await ingestor.ingest(
        IngestRequest(
            document_id="doc-e102",
            filename="e102_report.pdf",
            storage_path=str(doc_path),
            mime="application/pdf",
        ),
        record=doc_record,
    )

    assert result.document_id == "doc-e102"
    assert result.chunk_count >= 2
    assert result.page_count == 2
    stored_events = await events.replay("__global__")
    emitted_types = [e.type for e in stored_events]
    assert EventType.DOCUMENT_INGESTED in emitted_types
    assert EventType.PAGE_CLASSIFIED in emitted_types

    # Verify status in database is INDEXED
    async with database.session() as session:
        stored_doc = await KnowledgeRepository(session).get_document("doc-e102")
        assert stored_doc is not None
        assert stored_doc.status == DocumentStatus.INDEXED
        stored_chunks = await KnowledgeRepository(session).list_chunks("doc-e102")
        assert len(stored_chunks) == result.chunk_count

    # 5. Hybrid Retrieval
    retriever = HybridRetriever(
        embedder=embedder,
        index=index,
        settings=RagSettings(retrieve_fused_limit=10),
    )

    search_res = await retriever.search(
        SearchRequest(query="What was the measured thickness of E-102?", top_k=3)
    )

    assert len(search_res.chunks) >= 1
    top_chunk = search_res.chunks[0]
    assert "6.8 mm" in top_chunk.text
    assert top_chunk.document_id == "doc-e102"
    assert top_chunk.page_from == 1

    citations = build_citations(search_res.chunks)
    assert citations[0].marker == "[C1]"
    assert citations[0].page_from == 1
