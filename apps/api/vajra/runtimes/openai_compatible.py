"""OpenAI-compatible runtime adapter.

Implements ``health``, ``list_available``, ``chat`` and ``embed`` against the
``/v1`` surface that vLLM, llama.cpp's server, LM Studio and TGI all expose.

``load``, ``unload`` and ``resident`` raise
:class:`~vajra.core.exceptions.AdapterCapabilityError`. That is the truthful
answer for this family of runtimes: they pin their model at process start and
expose no residency control (Section E). Reporting "success" here would make the
VRAM scheduler lie about what it did.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator, Sequence
from datetime import UTC, datetime
from typing import Any

import httpx

from vajra.core.enums import HealthState, RuntimeKind
from vajra.core.exceptions import (
    AdapterCapabilityError,
    RuntimeAdapterError,
    RuntimeUnreachable,
)
from vajra.runtimes.base import (
    ChatChunk,
    ChatMessage,
    ChatRequest,
    EmbedResult,
    ResidentModel,
    RuntimeHealth,
    RuntimeModelInfo,
    ToolCall,
)


class OpenAICompatibleProvider:
    """Adapter for any server speaking the OpenAI ``/v1`` protocol."""

    kind: RuntimeKind = RuntimeKind.OPENAI_COMPATIBLE

    def __init__(
        self,
        *,
        runtime_id: str,
        base_url: str,
        api_key: str | None = None,
        request_timeout_s: float = 300.0,
        connect_timeout_s: float = 5.0,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.runtime_id = runtime_id
        self.base_url = base_url.rstrip("/")
        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient(
            base_url=self.base_url,
            timeout=httpx.Timeout(request_timeout_s, connect=connect_timeout_s),
            headers=headers,
        )

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    # --- transport -------------------------------------------------------

    async def _request(self, method: str, path: str, body: dict[str, Any] | None = None) -> Any:
        try:
            response = await self._client.request(method, path, json=body)
        except httpx.HTTPError as exc:
            raise RuntimeUnreachable(
                f"Runtime unreachable at {self.base_url}: {exc}", runtime_id=self.runtime_id
            ) from exc
        if response.status_code >= 400:
            raise RuntimeAdapterError(
                f"Runtime returned {response.status_code} for {path}: {response.text[:500]}",
                runtime_id=self.runtime_id,
            )
        try:
            return response.json()
        except ValueError as exc:
            raise RuntimeAdapterError(
                f"Runtime returned a non-JSON body for {path}", runtime_id=self.runtime_id
            ) from exc

    # --- implemented operations -----------------------------------------

    async def health(self) -> RuntimeHealth:
        started = datetime.now(UTC)
        try:
            await self._request("GET", "/v1/models")
        except RuntimeUnreachable as exc:
            return RuntimeHealth(
                state=HealthState.UNHEALTHY,
                kind=self.kind,
                base_url=self.base_url,
                detail=str(exc.detail),
                checked_at=started,
            )
        except RuntimeAdapterError as exc:
            return RuntimeHealth(
                state=HealthState.DEGRADED,
                kind=self.kind,
                base_url=self.base_url,
                detail=str(exc.detail),
                checked_at=started,
            )
        elapsed_ms = (datetime.now(UTC) - started).total_seconds() * 1000
        return RuntimeHealth(
            state=HealthState.HEALTHY,
            kind=self.kind,
            base_url=self.base_url,
            latency_ms=elapsed_ms,
            checked_at=started,
        )

    async def list_available(self) -> list[RuntimeModelInfo]:
        payload = await self._request("GET", "/v1/models")
        entries = payload.get("data", []) if isinstance(payload, dict) else []
        return [
            RuntimeModelInfo(id=entry.get("id", ""), details=dict(entry))
            for entry in entries
            if entry.get("id")
        ]

    async def chat(self, request: ChatRequest) -> AsyncIterator[ChatChunk]:
        body = self._chat_body(request)
        timeout = (
            httpx.Timeout(request.timeout_s)
            if request.timeout_s is not None
            else httpx.USE_CLIENT_DEFAULT
        )
        try:
            async with self._client.stream(
                "POST", "/v1/chat/completions", json=body, timeout=timeout
            ) as response:
                if response.status_code >= 400:
                    detail = (await response.aread()).decode("utf-8", "replace")[:500]
                    raise RuntimeAdapterError(
                        f"Chat completion failed with {response.status_code}: {detail}",
                        runtime_id=self.runtime_id,
                    )
                async for line in response.aiter_lines():
                    chunk = self._parse_sse_line(line)
                    if chunk is not None:
                        yield chunk
        except httpx.HTTPError as exc:
            raise RuntimeUnreachable(
                f"Runtime unreachable at {self.base_url}: {exc}", runtime_id=self.runtime_id
            ) from exc

    def _chat_body(self, request: ChatRequest) -> dict[str, Any]:
        body: dict[str, Any] = {
            "model": request.model,
            "messages": [self._message_body(message) for message in request.messages],
            "stream": request.stream,
        }
        if request.temperature is not None:
            body["temperature"] = request.temperature
        if request.top_p is not None:
            body["top_p"] = request.top_p
        if request.max_output_tokens is not None:
            body["max_tokens"] = request.max_output_tokens
        if request.stop:
            body["stop"] = list(request.stop)
        if request.seed is not None:
            body["seed"] = request.seed
        if request.tools:
            body["tools"] = [
                {
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": tool.parameters,
                    },
                }
                for tool in request.tools
            ]
        if request.json_schema is not None:
            body["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": "vajra_output", "schema": request.json_schema},
            }
        return body

    @staticmethod
    def _message_body(message: ChatMessage) -> dict[str, Any]:
        if not message.images:
            return {"role": message.role, "content": message.content}
        parts: list[dict[str, Any]] = [{"type": "text", "text": message.content}]
        parts.extend(
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image}"}}
            for image in message.images
        )
        return {"role": message.role, "content": parts}

    def _parse_sse_line(self, line: str) -> ChatChunk | None:
        if not line.startswith("data:"):
            return None
        data = line[len("data:") :].strip()
        if not data:
            return None
        if data == "[DONE]":
            return ChatChunk(done=True)
        try:
            payload = json.loads(data)
        except ValueError:
            return None
        choices = payload.get("choices") or []
        if not choices:
            return None
        choice = choices[0]
        delta = choice.get("delta") or choice.get("message") or {}
        tool_calls = [
            ToolCall(
                id=call.get("id"),
                name=(call.get("function") or {}).get("name", ""),
                arguments=_loads_or_empty((call.get("function") or {}).get("arguments")),
            )
            for call in delta.get("tool_calls") or []
        ]
        usage = payload.get("usage") or {}
        return ChatChunk(
            delta=delta.get("content") or "",
            done=choice.get("finish_reason") is not None,
            tool_calls=tool_calls,
            finish_reason=choice.get("finish_reason"),
            prompt_tokens=usage.get("prompt_tokens"),
            completion_tokens=usage.get("completion_tokens"),
        )

    async def embed(self, texts: Sequence[str], model: str) -> EmbedResult:
        payload = await self._request(
            "POST", "/v1/embeddings", {"model": model, "input": list(texts)}
        )
        entries = payload.get("data", []) if isinstance(payload, dict) else []
        vectors = [[float(value) for value in entry.get("embedding", [])] for entry in entries]
        if not vectors or not vectors[0]:
            raise RuntimeAdapterError(
                f"Runtime returned no embeddings for model {model}", runtime_id=self.runtime_id
            )
        return EmbedResult(vectors=vectors, model=model, dimensions=len(vectors[0]))

    # --- operations this runtime family does not have --------------------

    async def load(self, model_id: str) -> None:
        raise AdapterCapabilityError(
            "This runtime pins its model at process start; there is no load operation.",
            runtime_id=self.runtime_id,
            operation="load",
            model_id=model_id,
        )

    async def unload(self, model_id: str) -> None:
        raise AdapterCapabilityError(
            "This runtime pins its model at process start; there is no unload operation.",
            runtime_id=self.runtime_id,
            operation="unload",
            model_id=model_id,
        )

    async def resident(self) -> list[ResidentModel]:
        raise AdapterCapabilityError(
            "This runtime does not expose VRAM residency. Do not infer it from /v1/models: "
            "a listed model is not evidence that it occupies VRAM.",
            runtime_id=self.runtime_id,
            operation="resident",
        )

    async def show(self, model_id: str) -> dict[str, Any]:
        payload = await self._request("GET", f"/v1/models/{model_id}")
        return payload if isinstance(payload, dict) else {"data": payload}


def _loads_or_empty(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except ValueError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}
