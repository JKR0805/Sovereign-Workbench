"""Integration tests for conversation persistence (Phase 2 of the plan)."""

from __future__ import annotations

import asyncio

import httpx
import pytest

from vajra.core.dependencies import AppContext
from vajra.core.enums import RunStatus
from vajra.orchestrator.models import ConversationCreateRequest
from vajra.registry.models import ModelUpdate
from vajra.store.models import RunRecord
from vajra.store.repositories.runs import RunRepository


@pytest.mark.asyncio
async def test_conversation_crud_via_http(authenticated_client: httpx.AsyncClient) -> None:
    create_resp = await authenticated_client.post("/api/conversations", json={"title": "E-102 review"})
    assert create_resp.status_code == 201
    conversation = create_resp.json()
    conversation_id = conversation["id"]
    assert conversation["title"] == "E-102 review"
    assert conversation["message_count"] == 0

    list_resp = await authenticated_client.get("/api/conversations")
    assert list_resp.status_code == 200
    assert any(item["id"] == conversation_id for item in list_resp.json()["items"])

    detail_resp = await authenticated_client.get(f"/api/conversations/{conversation_id}")
    assert detail_resp.status_code == 200
    assert detail_resp.json()["messages"] == []

    patch_resp = await authenticated_client.patch(
        f"/api/conversations/{conversation_id}", json={"pinned": True}
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["pinned"] is True

    delete_resp = await authenticated_client.delete(f"/api/conversations/{conversation_id}")
    assert delete_resp.status_code == 204

    missing_resp = await authenticated_client.get(f"/api/conversations/{conversation_id}")
    assert missing_resp.status_code == 404


@pytest.mark.asyncio
async def test_conversation_turn_lifecycle_via_service(test_context: AppContext) -> None:
    """Exercises open_turn -> bind_run -> close_turn -> history_for directly
    against the service the run orchestrator calls, so this is deterministic
    and does not depend on a live model runtime. Also proves auto-titling:
    an untitled conversation takes its title from the first prompt.
    """
    conversations = test_context.conversations

    created = await conversations.create(ConversationCreateRequest())
    conversation_id = created.id
    assert created.title == "New conversation"

    handle = await conversations.open_turn(
        conversation_id, prompt="What is the retirement threshold for E-102?", attachments=[]
    )
    assert handle.user_ordinal == 0
    assert handle.assistant_ordinal == 1

    async with test_context.database.session() as session:
        run_record = await RunRepository(session).create(
            RunRecord(prompt="What is the retirement threshold for E-102?")
        )
    await conversations.bind_run(handle, run_id=run_record.id)

    detail = await conversations.detail(conversation_id)
    assert detail.title == "What is the retirement threshold for E-102?"
    assert len(detail.messages) == 2
    assert detail.messages[0].role == "user"
    assert detail.messages[1].status.value == "streaming"

    await conversations.close_turn(
        handle,
        content="6.4 mm per ASME Section VIII.",
        model_id="general-reasoning",
        runtime_model_id="qwen3:8b",
        prompt_tokens=42,
        completion_tokens=18,
        tokens_per_sec=12.5,
        duration_ms=910.0,
        citations=[{"marker": "[C1]", "chunk_id": "abc", "document_id": "doc-1"}],
    )

    detail = await conversations.detail(conversation_id)
    assistant = detail.messages[1]
    assert assistant.status.value == "complete"
    assert assistant.content == "6.4 mm per ASME Section VIII."
    assert assistant.prompt_tokens == 42
    assert assistant.completion_tokens == 18
    assert assistant.citations[0]["chunk_id"] == "abc"
    assert detail.total_tokens == 60
    assert detail.last_model_id == "general-reasoning"

    # A second close_turn call must not clobber the already-terminal message.
    await conversations.close_turn(
        handle,
        content="overwritten?",
        model_id=None,
        runtime_model_id=None,
        prompt_tokens=None,
        completion_tokens=None,
        tokens_per_sec=None,
        duration_ms=None,
        citations=[],
    )
    detail = await conversations.detail(conversation_id)
    assert detail.messages[1].content == "6.4 mm per ASME Section VIII."

    # A second turn's history excludes its own placeholder and sees turn one.
    handle2 = await conversations.open_turn(conversation_id, prompt="And for E-103?", attachments=[])
    history = await conversations.history_for(
        conversation_id, exclude_message_ids={handle2.user_message_id, handle2.assistant_message_id}
    )
    assert [t.role for t in history] == ["user", "assistant"]
    assert history[1].content == "6.4 mm per ASME Section VIII."


@pytest.mark.asyncio
async def test_run_with_conversation_id_closes_turn_on_failure(
    authenticated_client: httpx.AsyncClient, test_context: AppContext
) -> None:
    """No healthy models -> the classify step raises NoCandidateModels -> the
    run fails -> the assistant placeholder must be closed FAILED, never left
    PENDING, and the create response must echo the message ids."""
    for record in await test_context.registry.list():
        await test_context.registry.update(record.id, ModelUpdate(enabled=False))

    conv_resp = await authenticated_client.post("/api/conversations", json={})
    conversation_id = conv_resp.json()["id"]

    run_resp = await authenticated_client.post(
        "/api/runs",
        json={
            "prompt": "Summarise the last inspection",
            "execution_mode": "agent",
            "conversation_id": conversation_id,
        },
    )
    assert run_resp.status_code == 202
    created = run_resp.json()
    assert created["conversation_id"] == conversation_id
    assert created["user_message_id"]
    assert created["assistant_message_id"]

    for _ in range(50):
        run_data = (await authenticated_client.get(f"/api/runs/{created['run_id']}")).json()
        if run_data["status"] == RunStatus.FAILED.value:
            break
        await asyncio.sleep(0.1)
    else:
        pytest.fail("run did not fail in time")

    detail_resp = await authenticated_client.get(f"/api/conversations/{conversation_id}")
    assert detail_resp.status_code == 200
    messages = detail_resp.json()["messages"]
    assert len(messages) == 2
    assistant = messages[1]
    assert assistant["status"] == "failed"
    assert assistant["error"]
