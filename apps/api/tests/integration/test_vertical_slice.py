"""Integration tests for the complete vertical slice: run creation, demo execution, SSE stream, and replay."""

from __future__ import annotations

import asyncio

import httpx
import pytest

from vajra.core.enums import RunStatus


@pytest.mark.asyncio
async def test_vertical_slice_demo_run(async_client: httpx.AsyncClient) -> None:
    """End-to-end vertical slice:

    1. POST /api/runs creates a run and returns 202 with run_id and events_url.
    2. Background demo executor runs steps and emits events.
    3. GET /api/runs/{run_id} transitions to COMPLETED.
    4. GET /api/runs/{run_id}/steps lists the executed steps.
    5. GET /api/runs/{run_id}/events returns SSE stream with durable events.
    """
    create_payload = {
        "prompt": "Synthesize a market summary of aerospace manufacturing",
        "execution_mode": "demo",
    }
    response = await async_client.post("/api/runs", json=create_payload)
    assert response.status_code == 202
    created = response.json()
    run_id = created["run_id"]
    assert isinstance(run_id, str) and len(run_id) >= 16
    assert created["status"] in ("queued", "running", "completed")
    assert created["execution_mode"] == "demo"
    assert f"/api/runs/{run_id}/events" in created["events_url"]

    # Poll until the demo run completes (typically takes < 1 second)
    run_data = None
    for _ in range(30):
        run_resp = await async_client.get(f"/api/runs/{run_id}")
        assert run_resp.status_code == 200
        run_data = run_resp.json()
        if run_data["status"] == RunStatus.COMPLETED.value:
            break
        await asyncio.sleep(0.1)
    else:
        pytest.fail(f"Run {run_id} did not complete within timeout; status is {run_data}")

    assert run_data["status"] == RunStatus.COMPLETED.value
    assert run_data["duration_ms"] is not None
    assert run_data["duration_ms"] >= 0

    # Verify steps
    steps_resp = await async_client.get(f"/api/runs/{run_id}/steps")
    assert steps_resp.status_code == 200
    steps = steps_resp.json()
    assert len(steps) > 0

    # Verify SSE events endpoint
    events_resp = await async_client.get(f"/api/runs/{run_id}/events")
    assert events_resp.status_code == 200
    assert "text/event-stream" in events_resp.headers["content-type"]
    body = events_resp.text
    assert "event:" in body
    assert "data:" in body
    assert "RUN_COMPLETED" in body


@pytest.mark.asyncio
async def test_agent_run_fails_with_not_implemented(async_client: httpx.AsyncClient) -> None:
    """Requesting execution_mode='agent' creates a run that terminates with honest not_implemented error."""
    payload = {
        "prompt": "Autonomous workflow needing full agent",
        "execution_mode": "agent",
    }
    response = await async_client.post("/api/runs", json=payload)
    assert response.status_code == 202
    created = response.json()
    run_id = created["run_id"]

    # Poll until the run terminates with FAILED status
    run_data = None
    for _ in range(30):
        run_resp = await async_client.get(f"/api/runs/{run_id}")
        assert run_resp.status_code == 200
        run_data = run_resp.json()
        if run_data["status"] == RunStatus.FAILED.value:
            break
        await asyncio.sleep(0.1)
    else:
        pytest.fail(f"Run {run_id} did not transition to FAILED; status is {run_data}")

    assert run_data["status"] == RunStatus.FAILED.value
    assert "not implemented" in run_data["error"].lower()
