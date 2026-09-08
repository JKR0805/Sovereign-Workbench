"""Integration test for the vision preprocessing node.

Proves the two-stage image pipeline end to end: an attached image is first
described by a vision-capable model, then the *text* task (routed on its own
intent, e.g. code) is answered by a different model that never sees the raw
image -- only the vision model's description.
"""

from __future__ import annotations

import asyncio
import base64
from collections.abc import AsyncIterator, Sequence

import pytest

from vajra.core.dependencies import AppContext
from vajra.core.enums import ExecutionMode, Modality, RunStatus
from vajra.orchestrator.models import RunAttachment, RunCreateRequest
from vajra.registry.models import ModelRegistration, ModelUpdate
from vajra.runtimes.base import ChatChunk, ChatRequest, RuntimeHealth
from vajra.store.repositories.runs import RunRepository


async def _steps_by_node(context: AppContext, run_id: str) -> dict[str, object]:
    """``RunStepRead`` deliberately omits ``input``/``output``; read the raw
    records to assert on them, the same way the DB-level step tests do."""
    async with context.database.session() as session:
        records = await RunRepository(session).list_steps(run_id)
    return {record.node_id: record for record in records}


async def _disable_all_models_except(context: AppContext, keep: set[str]) -> None:
    for record in await context.registry.list():
        if record.id not in keep:
            await context.registry.update(record.id, ModelUpdate(enabled=False))


#: A minimal but syntactically real PNG (1x1 transparent pixel).
_TINY_PNG = base64.b64encode(
    bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108020000009077"
        "53de0000000c4944415478da6360000002000155eab9280000000049454e44"
        "ae426082"
    )
).decode("ascii")

VISION_REPLY = "A hand-drawn flowchart with three boxes labelled Start, Process, End."
TEXT_REPLY = "def process():\n    return 'done'\n"


class ScriptedAdapter:
    """A fake ``RuntimeAdapter`` that returns a canned reply per model id.

    Records every request it receives so the test can assert on what was
    actually sent -- in particular, that the text model's request carries no
    image data once the vision step has consumed it.
    """

    kind = None
    runtime_id = "ollama-local"

    def __init__(self, base_url: str, replies: dict[str, str]) -> None:
        self.base_url = base_url
        self._replies = replies
        self.requests: list[ChatRequest] = []

    async def health(self) -> RuntimeHealth:
        raise NotImplementedError

    async def list_available(self):
        return []

    async def chat(self, request: ChatRequest) -> AsyncIterator[ChatChunk]:
        self.requests.append(request)
        reply = self._replies[request.model]
        yield ChatChunk(delta=reply, prompt_tokens=42, completion_tokens=7)
        yield ChatChunk(done=True, prompt_tokens=42, completion_tokens=7, eval_duration_ms=100.0)

    async def embed(self, texts: Sequence[str], model: str):
        raise NotImplementedError

    async def load(self, model_id: str) -> None:
        raise NotImplementedError

    async def unload(self, model_id: str) -> None:
        raise NotImplementedError

    async def resident(self):
        return []

    async def show(self, model_id: str):
        return {}

    async def aclose(self) -> None:
        pass


@pytest.mark.asyncio
async def test_image_is_captioned_then_a_text_model_answers_the_query(
    test_context: AppContext,
) -> None:
    runtime = await test_context.runtimes.get("ollama-local")

    vision_model = await test_context.registry.register(
        ModelRegistration(
            id="vision-model",
            display_name="Vision Specialist",
            runtime_id=runtime.id,
            runtime_model_id="vision:latest",
            capabilities={"vision": 0.9, "text": 0.4},
            context_window=8192,
            modalities_in=[Modality.TEXT, Modality.IMAGE],
        ),
        probe=False,
    )
    text_model = await test_context.registry.register(
        ModelRegistration(
            id="text-model",
            display_name="Coding Specialist",
            runtime_id=runtime.id,
            runtime_model_id="text:latest",
            capabilities={"text": 0.9, "coding": 0.9},
            context_window=8192,
            modalities_in=[Modality.TEXT],
        ),
        probe=False,
    )

    # The test settings profile seeds real, profile-configured models
    # (config/models/*.yaml). Disable every candidate but the two fakes so
    # the router can only ever choose between them, regardless of what a
    # profile happens to seed or what real runtimes are reachable in this
    # environment.
    await _disable_all_models_except(test_context, {"vision-model", "text-model"})

    adapter = ScriptedAdapter(
        base_url=runtime.base_url.rstrip("/"),
        replies={
            vision_model.runtime_model_id: VISION_REPLY,
            text_model.runtime_model_id: TEXT_REPLY,
        },
    )
    test_context.runtimes._adapters[runtime.id] = adapter

    request = RunCreateRequest(
        prompt="Write a python function that implements the logic in this flowchart",
        execution_mode=ExecutionMode.AGENT,
        attachments=[
            RunAttachment(
                filename="flowchart.png",
                mime="image/png",
                size_bytes=len(_TINY_PNG),
                data_base64=_TINY_PNG,
            )
        ],
    )
    created = await test_context.orchestrator.create(request)
    run_id = created.run_id

    run = None
    for _ in range(100):
        run = await test_context.orchestrator.get(run_id)
        if run.status in (RunStatus.COMPLETED, RunStatus.FAILED):
            break
        await asyncio.sleep(0.05)
    else:
        pytest.fail(f"Run {run_id} did not terminate; last status is {run}")

    assert run.status == RunStatus.COMPLETED, run.error

    steps = await _steps_by_node(test_context, run_id)

    vision_step = steps["vision"]
    assert vision_step.status.value == "completed"
    assert vision_step.output["consumed"] is True
    assert vision_step.output["model_id"] == "vision-model"
    assert vision_step.output["description"] == VISION_REPLY

    classify_step = steps["classify"]
    assert classify_step.routing_decision["selected"] == "text-model"

    execute_step = steps["execute"]
    assert execute_step.output["model"] == "text-model"
    assert execute_step.output["reply"] == TEXT_REPLY

    # The vision model was actually shown the image; the text model was not.
    vision_calls = [r for r in adapter.requests if r.model == vision_model.runtime_model_id]
    text_calls = [r for r in adapter.requests if r.model == text_model.runtime_model_id]
    assert len(vision_calls) == 1
    assert vision_calls[0].messages[0].images == [_TINY_PNG]
    assert len(text_calls) == 1
    assert all(not msg.images for msg in text_calls[0].messages)

    # The text model's system prompt carries the vision model's description
    # as its only source of information about the image.
    system_message = next(m for m in text_calls[0].messages if m.role == "system")
    assert VISION_REPLY in system_message.content
    assert "vision-model" in system_message.content

    assert run.total_tokens is not None and run.total_tokens > 0
    assert set(run.models_used) == {"vision-model", "text-model"}


@pytest.mark.asyncio
async def test_vision_step_is_a_noop_without_attachments(
    test_context: AppContext,
) -> None:
    """The vision node is always emitted, with a stable, honest shape, even
    when there is nothing to describe -- so the frontend graph reducer never
    has to special-case a missing node."""
    await _disable_all_models_except(test_context, set())

    request = RunCreateRequest(
        prompt="What is 2 + 2?",
        execution_mode=ExecutionMode.AGENT,
    )
    created = await test_context.orchestrator.create(request)
    run_id = created.run_id

    run = None
    for _ in range(50):
        run = await test_context.orchestrator.get(run_id)
        if run.status == RunStatus.FAILED:
            break
        await asyncio.sleep(0.05)
    else:
        pytest.fail(f"Run {run_id} did not fail as expected; last status is {run}")

    steps = await _steps_by_node(test_context, run_id)
    vision_step = steps["vision"]
    assert vision_step.status.value == "completed"
    assert vision_step.output == {"images": 0, "note": "no image attachments"}
