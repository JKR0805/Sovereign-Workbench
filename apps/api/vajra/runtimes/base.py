"""The ``RuntimeAdapter`` protocol and its transport-neutral data contracts.

Section E, layer 1: "A Protocol with no knowledge of what a model is good at."

Implementation rule 3: runtime specifics live only in this package. No
Ollama-shaped JSON, no ``/api/chat`` path and no ``keep_alive`` appears outside
``vajra.runtimes``. Everything above this layer speaks only in the types defined
here.

An operation a runtime genuinely cannot perform raises
:class:`~vajra.core.exceptions.AdapterCapabilityError`. That is a correct answer,
not a stub: vLLM pins its model at process start, so ``load``/``unload`` cannot
exist for it.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Sequence
from datetime import datetime
from typing import Any, Literal, Protocol, runtime_checkable

from pydantic import BaseModel, ConfigDict, Field

from vajra.core.enums import HealthState, RuntimeKind

ChatRole = Literal["system", "user", "assistant", "tool"]


class ChatMessage(BaseModel):
    """One turn. ``images`` holds base64-encoded image data for VLM input."""

    model_config = ConfigDict(frozen=True)

    role: ChatRole
    content: str
    images: list[str] = Field(default_factory=list)
    tool_call_id: str | None = None
    name: str | None = None


class ToolDefinition(BaseModel):
    """A tool offered to the model, in JSON-Schema form."""

    model_config = ConfigDict(frozen=True)

    name: str
    description: str
    parameters: dict[str, Any]


class ChatRequest(BaseModel):
    """A generation request, expressed without reference to any runtime's wire format."""

    model_config = ConfigDict(frozen=True)

    model: str
    """The ``runtime_model_id``. The only runtime-specific string in the system."""

    messages: Sequence[ChatMessage]
    stream: bool = True
    temperature: float | None = None
    top_p: float | None = None
    max_output_tokens: int | None = None
    num_ctx: int | None = None
    stop: Sequence[str] = ()
    tools: Sequence[ToolDefinition] = ()
    json_schema: dict[str, Any] | None = None
    """When set, the runtime is asked to constrain output to this schema."""

    seed: int | None = None
    timeout_s: float | None = None


class ToolCall(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str | None = None
    name: str
    arguments: dict[str, Any] = Field(default_factory=dict)


class ChatChunk(BaseModel):
    """One increment of a streamed generation.

    The final chunk of a stream has ``done=True`` and carries the usage numbers.
    Those numbers are measured by the runtime; nothing in VAJRA estimates them.
    """

    model_config = ConfigDict(frozen=True)

    delta: str = ""
    done: bool = False
    tool_calls: list[ToolCall] = Field(default_factory=list)
    finish_reason: str | None = None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_duration_ms: float | None = None
    eval_duration_ms: float | None = None

    @property
    def tokens_per_sec(self) -> float | None:
        """Measured throughput, or ``None`` when the runtime did not report timings."""
        if self.completion_tokens and self.eval_duration_ms:
            if self.eval_duration_ms <= 0:
                return None
            return self.completion_tokens / (self.eval_duration_ms / 1000.0)
        return None


class EmbedResult(BaseModel):
    model_config = ConfigDict(frozen=True)

    vectors: list[list[float]]
    model: str
    dimensions: int


class RuntimeHealth(BaseModel):
    model_config = ConfigDict(frozen=True)

    state: HealthState
    kind: RuntimeKind
    base_url: str
    version: str | None = None
    detail: str | None = None
    latency_ms: float | None = None
    checked_at: datetime


class RuntimeModelInfo(BaseModel):
    """A model the runtime reports as present. Purely descriptive.

    Nothing here is a capability claim: what a model is *good at* is
    :class:`~vajra.store.models.ModelRecord` data, established by probing.
    """

    model_config = ConfigDict(frozen=True)

    id: str
    size_bytes: int | None = None
    digest: str | None = None
    family: str | None = None
    parameter_size: str | None = None
    quantization: str | None = None
    modified_at: datetime | None = None
    details: dict[str, Any] = Field(default_factory=dict)


class ResidentModel(BaseModel):
    """A model currently occupying VRAM. Drives the residency planner (Section E)."""

    model_config = ConfigDict(frozen=True)

    id: str
    vram_bytes: int | None = None
    expires_at: datetime | None = None


@runtime_checkable
class RuntimeAdapter(Protocol):
    """How to talk to a model runtime."""

    kind: RuntimeKind
    runtime_id: str
    base_url: str

    async def health(self) -> RuntimeHealth:
        """Is the runtime reachable, and which version is it."""
        ...

    async def list_available(self) -> list[RuntimeModelInfo]:
        """Which models the runtime already holds."""
        ...

    def chat(self, request: ChatRequest) -> AsyncIterator[ChatChunk]:
        """Stream a generation. Always a stream, even for a single-shot request."""
        ...

    async def embed(self, texts: Sequence[str], model: str) -> EmbedResult:
        """Embed texts with the named model."""
        ...

    async def load(self, model_id: str) -> None:
        """Bring a model into VRAM. Raises ``AdapterCapabilityError`` where meaningless."""
        ...

    async def unload(self, model_id: str) -> None:
        """Evict a model from VRAM. Raises ``AdapterCapabilityError`` where meaningless."""
        ...

    async def resident(self) -> list[ResidentModel]:
        """Which models currently occupy VRAM."""
        ...

    async def show(self, model_id: str) -> dict[str, Any]:
        """Raw runtime metadata for the Model Details page."""
        ...

    async def aclose(self) -> None:
        """Release transport resources."""
        ...
