"""Integration tests for the Knowledge API endpoints (documents, chunks, search)."""

from __future__ import annotations

import httpx
import pytest
from fastapi import status


@pytest.mark.asyncio
async def test_knowledge_api_document_lifecycle_and_search(
    authenticated_client: httpx.AsyncClient,
) -> None:
    """Full API integration test: upload document -> list -> chunk inspection -> search -> delete."""
    doc_content = (
        b"# Heat Exchanger E-102 Inspection\n\n"
        b"Measured wall thickness: 6.8 mm across all passes.\n\n"
        b"## Retirement Threshold\n\n"
        b"Minimum allowable thickness is 6.4 mm according to ASME Section VIII."
    )

    # 1. Upload document
    files = {"file": ("e102_inspection.md", doc_content, "text/markdown")}
    upload_resp = await authenticated_client.post("/api/knowledge/documents", files=files)
    assert upload_resp.status_code == status.HTTP_201_CREATED
    data = upload_resp.json()
    doc_id = data["id"]
    assert data["filename"] == "e102_inspection.md"
    assert data["status"] == "indexed"
    assert data["page_count"] == 1

    # 2. List documents
    list_resp = await authenticated_client.get("/api/knowledge/documents")
    assert list_resp.status_code == status.HTTP_200_OK
    docs = list_resp.json()
    assert any(d["id"] == doc_id for d in docs)

    # 3. Get document by ID
    get_resp = await authenticated_client.get(f"/api/knowledge/documents/{doc_id}")
    assert get_resp.status_code == status.HTTP_200_OK
    assert get_resp.json()["id"] == doc_id

    # 4. List chunks
    chunks_resp = await authenticated_client.get(f"/api/knowledge/documents/{doc_id}/chunks")
    assert chunks_resp.status_code == status.HTTP_200_OK
    chunks = chunks_resp.json()
    assert len(chunks) >= 1
    assert any("6.8 mm" in c["text"] for c in chunks)

    # 5. Search corpus with citation generation
    search_payload = {
        "query": "What is the measured wall thickness for E-102?",
        "top_k": 3,
    }
    search_resp = await authenticated_client.post("/api/knowledge/search", json=search_payload)
    assert search_resp.status_code == status.HTTP_200_OK
    search_data = search_resp.json()
    assert search_data["query"] == search_payload["query"]
    assert len(search_data["chunks"]) >= 1

    top_chunk = search_data["chunks"][0]
    assert top_chunk["marker"] == "[C1]"
    assert "6.8 mm" in top_chunk["text"]
    assert top_chunk["document_id"] == doc_id
    assert "timings" in search_data

    # 6. Delete document
    del_resp = await authenticated_client.delete(f"/api/knowledge/documents/{doc_id}")
    assert del_resp.status_code == status.HTTP_204_NO_CONTENT

    # Verify document 404s after deletion
    get_after_del = await authenticated_client.get(f"/api/knowledge/documents/{doc_id}")
    assert get_after_del.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
async def test_knowledge_api_rejects_unsupported_format(
    authenticated_client: httpx.AsyncClient,
) -> None:
    """Uploading an unsupported document type must return HTTP 400."""
    bad_file = {"file": ("malicious.exe", b"\x4d\x5a\x90\x00", "application/octet-stream")}
    resp = await authenticated_client.post("/api/knowledge/documents", files=bad_file)
    assert resp.status_code == status.HTTP_400_BAD_REQUEST
    assert "Unsupported document format" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_session_only_attachment_and_explicit_promotion(
    authenticated_client: httpx.AsyncClient,
) -> None:
    """Verify session-only uploads are excluded from corpus search until explicitly promoted."""
    doc_content = (
        b"# Reactor Emergency Protocols\n\n"
        b"The emergency core override code is ALPHA-994821 for sector 7."
    )

    # 1. Upload as session-only (canonical=false)
    files = {"file": ("emergency_protocol.md", doc_content, "text/markdown")}
    upload_resp = await authenticated_client.post(
        "/api/knowledge/documents?canonical=false", files=files
    )
    assert upload_resp.status_code == status.HTTP_201_CREATED
    data = upload_resp.json()
    doc_id = data["id"]
    assert data["is_canonical"] is False

    # 2. Canonical-only listing excludes it
    canon_list_resp = await authenticated_client.get("/api/knowledge/documents?canonical_only=true")
    assert canon_list_resp.status_code == status.HTTP_200_OK
    assert not any(d["id"] == doc_id for d in canon_list_resp.json())

    # 3. All documents listing includes it
    all_list_resp = await authenticated_client.get("/api/knowledge/documents?canonical_only=false")
    assert all_list_resp.status_code == status.HTTP_200_OK
    assert any(d["id"] == doc_id for d in all_list_resp.json())

    # 4. Corpus-wide search (no document_ids) MUST NOT retrieve session-only document
    corpus_search = await authenticated_client.post(
        "/api/knowledge/search",
        json={"query": "What is the emergency core override code?", "top_k": 3},
    )
    assert corpus_search.status_code == status.HTTP_200_OK
    assert not any(c["document_id"] == doc_id for c in corpus_search.json()["chunks"])

    # 5. Scoped search (document_ids=[doc_id]) DOES retrieve session-only document
    scoped_search = await authenticated_client.post(
        "/api/knowledge/search",
        json={
            "query": "What is the emergency core override code?",
            "document_ids": [doc_id],
            "top_k": 3,
        },
    )
    assert scoped_search.status_code == status.HTTP_200_OK
    scoped_chunks = scoped_search.json()["chunks"]
    assert len(scoped_chunks) >= 1
    assert any("ALPHA-994821" in c["text"] for c in scoped_chunks)

    # 6. Explicitly promote the document to canonical Knowledge Base
    promote_resp = await authenticated_client.post(f"/api/knowledge/documents/{doc_id}/promote")
    assert promote_resp.status_code == status.HTTP_200_OK
    assert promote_resp.json()["is_canonical"] is True

    # 7. Canonical-only listing now includes it
    canon_list_after = await authenticated_client.get("/api/knowledge/documents?canonical_only=true")
    assert any(d["id"] == doc_id for d in canon_list_after.json())

    # 8. Corpus-wide search NOW retrieves it as part of the canonical KB
    corpus_search_after = await authenticated_client.post(
        "/api/knowledge/search",
        json={"query": "What is the emergency core override code?", "top_k": 3},
    )
    assert corpus_search_after.status_code == status.HTTP_200_OK
    after_chunks = corpus_search_after.json()["chunks"]
    assert any(c["document_id"] == doc_id for c in after_chunks)
    assert any("ALPHA-994821" in c["text"] for c in after_chunks)

    # 9. Clean up
    del_resp = await authenticated_client.delete(f"/api/knowledge/documents/{doc_id}")
    assert del_resp.status_code == status.HTTP_204_NO_CONTENT

