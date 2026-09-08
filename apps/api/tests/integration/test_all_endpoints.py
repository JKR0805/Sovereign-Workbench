"""Comprehensive integration test suite exercising all 10 API module endpoints.

Covers:
1. System (/api/system/ping, /api/system/health)
2. Runtimes (/api/runtimes, /api/runtimes/{id}, probe, available)
3. Models (/api/models, /api/models/residency, /api/models/{id}, refresh)
4. Routing (/api/routing/capabilities, policies, simulate)
5. Knowledge & RAG (/api/knowledge/documents, chunks, search)
6. Tools (/api/tools, /api/tools/{name})
7. Sandbox & Guard (/api/sandbox/status, policy, guard)
8. Network Sentinel (/api/network/snapshot, events, nft/status, selfaudit, ruleset)
9. Audit Ledger (/api/audit/event-types, events, export)
10. Runs & Orchestration (/api/runs, steps, artifacts, events)
"""

from __future__ import annotations

import asyncio

import httpx
import pytest


@pytest.mark.asyncio
async def test_system_endpoints(async_client: httpx.AsyncClient) -> None:
    """Verify system ping and health reporting."""
    ping_resp = await async_client.get("/api/system/ping")
    assert ping_resp.status_code == 200
    assert ping_resp.json()["status"] == "ok"

    health_resp = await async_client.get("/api/system/health")
    assert health_resp.status_code == 200
    data = health_resp.json()
    assert "status" in data
    assert "services" in data
    assert "self_audit_passed" in data


@pytest.mark.asyncio
async def test_runtimes_endpoints(authenticated_client: httpx.AsyncClient) -> None:
    """Verify runtimes enumeration and probing endpoints."""
    resp = await authenticated_client.get("/api/runtimes")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)

    get_resp = await authenticated_client.get("/api/runtimes/ollama")
    assert get_resp.status_code in (200, 404)

    avail_resp = await authenticated_client.get("/api/runtimes/ollama/available")
    assert avail_resp.status_code in (200, 404)

    probe_resp = await authenticated_client.post("/api/runtimes/ollama/probe", json={})
    assert probe_resp.status_code in (200, 404)


@pytest.mark.asyncio
async def test_models_endpoints(authenticated_client: httpx.AsyncClient) -> None:
    """Verify model registry, residency tracking, and health refresh."""
    list_resp = await authenticated_client.get("/api/models")
    assert list_resp.status_code == 200
    models = list_resp.json()
    assert isinstance(models, list)

    residency_resp = await authenticated_client.get("/api/models/residency")
    assert residency_resp.status_code == 200
    assert "entries" in residency_resp.json()

    if models:
        first_id = models[0]["id"]
        get_resp = await authenticated_client.get(f"/api/models/{first_id}")
        assert get_resp.status_code == 200
        assert get_resp.json()["id"] == first_id

        refresh_resp = await authenticated_client.post(f"/api/models/{first_id}/refresh", json={})
        assert refresh_resp.status_code == 200


@pytest.mark.asyncio
async def test_routing_endpoints(authenticated_client: httpx.AsyncClient) -> None:
    """Verify routing capability profiles and simulation engine."""
    caps_resp = await authenticated_client.get("/api/routing/capabilities")
    assert caps_resp.status_code == 200

    policies_resp = await authenticated_client.get("/api/routing/policies")
    assert policies_resp.status_code == 200
    assert isinstance(policies_resp.json(), list)

    sim_payload = {
        "intent": "general_reasoning",
        "prompt": "Evaluate equipment status for heat exchanger E-102.",
        "context_tokens": 800,
        "required_capabilities": {"reasoning": 0.6},
    }
    sim_resp = await authenticated_client.post("/api/routing/simulate", json=sim_payload)
    assert sim_resp.status_code in (200, 422)


@pytest.mark.asyncio
async def test_knowledge_and_rag_endpoints(authenticated_client: httpx.AsyncClient) -> None:
    """Verify document upload, chunk extraction, and semantic search."""
    sample_content = (
        "# Vessel V-101 Inspection\n\n"
        "Operating pressure: 18.2 bar.\n"
        "Shell thickness: 9.4 mm.\n"
        "Minimum retirement thickness: 8.0 mm.\n"
    )
    files = {"file": ("vessel_v101.md", sample_content.encode("utf-8"), "text/markdown")}
    upload_resp = await authenticated_client.post("/api/knowledge/documents", files=files)
    assert upload_resp.status_code in (200, 201)
    doc_data = upload_resp.json()
    doc_id = doc_data["id"]

    list_resp = await authenticated_client.get("/api/knowledge/documents")
    assert list_resp.status_code == 200
    assert any(d["id"] == doc_id for d in list_resp.json())

    doc_resp = await authenticated_client.get(f"/api/knowledge/documents/{doc_id}")
    assert doc_resp.status_code == 200
    assert doc_resp.json()["filename"] == "vessel_v101.md"

    chunks_resp = await authenticated_client.get(f"/api/knowledge/documents/{doc_id}/chunks")
    assert chunks_resp.status_code == 200
    assert len(chunks_resp.json()) >= 1

    search_payload = {"query": "What is the shell thickness for V-101?", "top_k": 2}
    search_resp = await authenticated_client.post("/api/knowledge/search", json=search_payload)
    assert search_resp.status_code == 200
    search_data = search_resp.json()
    assert "chunks" in search_data
    assert "timings" in search_data


@pytest.mark.asyncio
async def test_tools_endpoints(authenticated_client: httpx.AsyncClient) -> None:
    """Verify tool discovery and schema inspection."""
    tools_resp = await authenticated_client.get("/api/tools")
    assert tools_resp.status_code == 200
    tools = tools_resp.json()
    assert isinstance(tools, list)
    assert len(tools) > 0

    tool_name = tools[0]["name"]
    single_tool_resp = await authenticated_client.get(f"/api/tools/{tool_name}")
    assert single_tool_resp.status_code == 200
    assert single_tool_resp.json()["name"] == tool_name


@pytest.mark.asyncio
async def test_sandbox_endpoints(authenticated_client: httpx.AsyncClient) -> None:
    """Verify sandbox runner status, execution policies, and AST guard analysis."""
    status_resp = await authenticated_client.get("/api/sandbox/status")
    assert status_resp.status_code == 200

    policy_resp = await authenticated_client.get("/api/sandbox/policy")
    assert policy_resp.status_code == 200

    # Benign code should be permitted
    benign_resp = await authenticated_client.post(
        "/api/sandbox/guard",
        json={"code": "total = sum([1, 2, 3, 4, 5])"},
    )
    assert benign_resp.status_code == 200
    assert benign_resp.json()["accepted"] is True

    # Prohibited socket networking should be blocked
    malicious_resp = await authenticated_client.post(
        "/api/sandbox/guard",
        json={"code": "import socket\nsock = socket.socket()"},
    )
    assert malicious_resp.status_code == 200
    assert malicious_resp.json()["accepted"] is False
    assert len(malicious_resp.json()["findings"]) > 0


@pytest.mark.asyncio
async def test_network_and_sovereignty_endpoints(authenticated_client: httpx.AsyncClient) -> None:
    """Verify network sentinel tables, events, and sovereignty self-audit."""
    snap_resp = await authenticated_client.get("/api/network/snapshot")
    assert snap_resp.status_code == 200
    assert "connections" in snap_resp.json()

    events_resp = await authenticated_client.get("/api/network/events")
    assert events_resp.status_code == 200
    assert isinstance(events_resp.json(), list)

    nft_resp = await authenticated_client.get("/api/network/nft/status")
    assert nft_resp.status_code == 200

    audit_resp = await authenticated_client.get("/api/network/selfaudit")
    assert audit_resp.status_code == 200

    ruleset_resp = await authenticated_client.get("/api/network/ruleset")
    assert ruleset_resp.status_code in (200, 503)


@pytest.mark.asyncio
async def test_audit_endpoints(authenticated_client: httpx.AsyncClient) -> None:
    """Verify audit event types, persistent event queries, and export contract."""
    types_resp = await authenticated_client.get("/api/audit/event-types")
    assert types_resp.status_code == 200
    assert len(types_resp.json()) > 0

    events_resp = await authenticated_client.get("/api/audit/events")
    assert events_resp.status_code == 200
    assert "items" in events_resp.json()

    # 501 Not Implemented expected for Phase 2 signed export bundle
    export_resp = await authenticated_client.get("/api/audit/export")
    assert export_resp.status_code in (200, 501)


@pytest.mark.asyncio
async def test_runs_orchestrator_lifecycle(authenticated_client: httpx.AsyncClient) -> None:
    """Verify complete run lifecycle: create, poll status, retrieve steps, and SSE events."""
    list_resp = await authenticated_client.get("/api/runs")
    assert list_resp.status_code == 200
    assert "items" in list_resp.json()

    create_payload = {
        "prompt": "Evaluate safety compliance for unit E-102",
        "execution_mode": "demo",
    }
    create_resp = await authenticated_client.post("/api/runs", json=create_payload)
    assert create_resp.status_code == 202
    created_data = create_resp.json()
    run_id = created_data["run_id"]
    assert "events_url" in created_data

    # Give deterministic demo executor a moment to process steps
    await asyncio.sleep(0.2)

    get_resp = await authenticated_client.get(f"/api/runs/{run_id}")
    assert get_resp.status_code == 200
    run_info = get_resp.json()
    assert run_info["id"] == run_id

    steps_resp = await authenticated_client.get(f"/api/runs/{run_id}/steps")
    assert steps_resp.status_code == 200
    assert len(steps_resp.json()) >= 1

    artifacts_resp = await authenticated_client.get(f"/api/runs/{run_id}/artifacts")
    assert artifacts_resp.status_code == 200

    sse_resp = await authenticated_client.get(f"/api/runs/{run_id}/events")
    assert sse_resp.status_code == 200
    assert "text/event-stream" in sse_resp.headers.get("content-type", "")
