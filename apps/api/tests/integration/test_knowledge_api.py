"""Integration tests for the Knowledge API endpoints (documents, chunks, search)."""

from __future__ import annotations

import httpx
import pytest
from fastapi import status


@pytest.mark.asyncio
async def test_knowledge_api_document_lifecycle_and_search(
    async_client: httpx.AsyncClient,
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
    upload_resp = await async_client.post("/api/knowledge/documents", files=files)
    assert upload_resp.status_code == status.HTTP_201_CREATED
    data = upload_resp.json()
    doc_id = data["id"]
    assert data["filename"] == "e102_inspection.md"
    assert data["status"] == "indexed"
    assert data["page_count"] == 1

    # 2. List documents
    list_resp = await async_client.get("/api/knowledge/documents")
    assert list_resp.status_code == status.HTTP_200_OK
    docs = list_resp.json()
    assert any(d["id"] == doc_id for d in docs)

    # 3. Get document by ID
    get_resp = await async_client.get(f"/api/knowledge/documents/{doc_id}")
    assert get_resp.status_code == status.HTTP_200_OK
    assert get_resp.json()["id"] == doc_id

    # 4. List chunks
    chunks_resp = await async_client.get(f"/api/knowledge/documents/{doc_id}/chunks")
    assert chunks_resp.status_code == status.HTTP_200_OK
    chunks = chunks_resp.json()
    assert len(chunks) >= 1
    assert any("6.8 mm" in c["text"] for c in chunks)

    # 5. Search corpus with citation generation
    search_payload = {
        "query": "What is the measured wall thickness for E-102?",
        "top_k": 3,
    }
    search_resp = await async_client.post("/api/knowledge/search", json=search_payload)
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
    del_resp = await async_client.delete(f"/api/knowledge/documents/{doc_id}")
    assert del_resp.status_code == status.HTTP_204_NO_CONTENT

    # Verify document 404s after deletion
    get_after_del = await async_client.get(f"/api/knowledge/documents/{doc_id}")
    assert get_after_del.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
async def test_knowledge_api_rejects_unsupported_format(
    async_client: httpx.AsyncClient,
) -> None:
    """Uploading an unsupported document type must return HTTP 400."""
    bad_file = {"file": ("malicious.exe", b"\x4d\x5a\x90\x00", "application/octet-stream")}
    resp = await async_client.post("/api/knowledge/documents", files=bad_file)
    assert resp.status_code == status.HTTP_400_BAD_REQUEST
    assert "Unsupported document format" in resp.json()["detail"]
