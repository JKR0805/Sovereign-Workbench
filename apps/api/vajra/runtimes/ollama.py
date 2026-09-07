"""Ollama adapter. The one complete runtime implementation (Section E).

Endpoints used: ``/api/version``, ``/api/tags``, ``/api/chat``, ``/api/embed``,
``/api/ps``, ``/api/show``.

Every Ollama-shaped detail in the system is contained in this file: the request
JSON, the NDJSON stream framing, the ``keep_alive`` semantics that implement
load/unload, and the nanosecond duration fields. Nothing above ``vajra.runtimes``
knows any of it.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator, Sequence
from datetime import UTC, datetime
from typing import Any

import httpx

from vajra.core.enums import HealthState, RuntimeKind
from vajra.core.exceptions import RuntimeAdapterError, RuntimeUnreachable
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

_NS_PER_MS = 1_000_000


def _ns_to_ms(value: Any) -> float | None:
    if isinstance(value, int | float) and value > 0:
        return float(value) / _NS_PER_MS
    return None


def _parse_ts(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


class OllamaProvider:
    """Complete :class:`~vajra.runtimes.base.RuntimeAdapter` implementation."""

    kind: RuntimeKind = RuntimeKind.OLLAMA

    def __init__(
        self,
        *,
        runtime_id: str,
        base_url: str,
        request_timeout_s: float = 300.0,
        connect_timeout_s: float = 5.0,
        keep_alive: str = "30m",
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.runtime_id = runtime_id
        self.base_url = base_url.rstrip("/")
        self.keep_alive = keep_alive
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient(
            base_url=self.base_url,
            timeout=httpx.Timeout(request_timeout_s, connect=connect_timeout_s),
        )

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    # --- transport -------------------------------------------------------

    async def _get(self, path: str) -> dict[str, Any]:
        try:
            response = await self._client.get(path)
        except httpx.HTTPError as exc:
            raise RuntimeUnreachable(
                f"Ollama unreachable at {self.base_url}: {exc}", runtime_id=self.runtime_id
            ) from exc
        return self._decode(response, path)

    async def _post(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        try:
            response = await self._client.post(path, json=body)
        except httpx.HTTPError as exc:
            raise RuntimeUnreachable(
                f"Ollama unreachable at {self.base_url}: {exc}", runtime_id=self.runtime_id
            ) from exc
        return self._decode(response, path)

    def _decode(self, response: httpx.Response, path: str) -> dict[str, Any]:
        if response.status_code >= 400:
            raise RuntimeAdapterError(
                f"Ollama returned {response.status_code} for {path}: {response.text[:500]}",
                runtime_id=self.runtime_id,
                status_code_upstream=response.status_code,
            )
        try:
            decoded = response.json()
        except ValueError as exc:
            raise RuntimeAdapterError(
                f"Ollama returned a non-JSON body for {path}", runtime_id=self.runtime_id
            ) from exc
        return decoded if isinstance(decoded, dict) else {"data": decoded}

    # --- health and inventory -------------------------------------------

    async def health(self) -> RuntimeHealth:
        started = datetime.now(UTC)
        try:
            payload = await self._get("/api/version")
        except RuntimeUnreachable as exc:
            return RuntimeHealth(
                state=HealthState.UNHEALTHY,
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
            version=payload.get("version"),
            latency_ms=elapsed_ms,
            checked_at=started,
        )

    async def list_available(self) -> list[RuntimeModelInfo]:
        payload = await self._get("/api/tags")
        models: list[RuntimeModelInfo] = []
        for entry in payload.get("models", []) or []:
            details = entry.get("details") or {}
            models.append(
                RuntimeModelInfo(
                    id=entry.get("name") or entry.get("model", ""),
                    size_bytes=entry.get("size"),
                    digest=entry.get("digest"),
                    family=details.get("family"),
                    parameter_size=details.get("parameter_size"),
                    quantization=details.get("quantization_level"),
                    modified_at=_parse_ts(entry.get("modified_at")),
                    details=details,
                )
            )
        return models

    async def show(self, model_id: str) -> dict[str, Any]:
        return await self._post("/api/show", {"model": model_id})

    async def resident(self) -> list[ResidentModel]:
        payload = await self._get("/api/ps")
        return [
            ResidentModel(
                id=entry.get("name") or entry.get("model", ""),
                vram_bytes=entry.get("size_vram"),
                expires_at=_parse_ts(entry.get("expires_at")),
            )
            for entry in payload.get("models", []) or []
        ]

    # --- VRAM residency --------------------------------------------------

    async def load(self, model_id: str) -> None:
        """Bring a model into VRAM.

        Ollama loads on an empty-message chat and honours ``keep_alive``; this is
        the documented warm-up call, not a side effect we are relying on.
        """
        await self._post(
            "/api/chat",
            {"model": model_id, "messages": [], "keep_alive": self.keep_alive, "stream": False},
        )

    async def unload(self, model_id: str) -> None:
        """Evict immediately by setting ``keep_alive`` to zero."""
        await self._post(
            "/api/chat", {"model": model_id, "messages": [], "keep_alive": 0, "stream": False}
        )

    # --- generation ------------------------------------------------------

    def _chat_body(self, request: ChatRequest) -> dict[str, Any]:
        options: dict[str, Any] = {}
        if request.temperature is not None:
            options["temperature"] = request.temperature
        if request.top_p is not None:
            options["top_p"] = request.top_p
        if request.max_output_tokens is not None:
            options["num_predict"] = request.max_output_tokens
        if request.num_ctx is not None:
            options["num_ctx"] = request.num_ctx
        if request.seed is not None:
            options["seed"] = request.seed
        if request.stop:
            options["stop"] = list(request.stop)

        body: dict[str, Any] = {
            "model": request.model,
            "messages": [self._message_body(message) for message in request.messages],
            "stream": request.stream,
            "keep_alive": self.keep_alive,
        }
        if options:
            body["options"] = options
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
            # Ollama accepts a JSON Schema directly in `format`.
            body["format"] = request.json_schema
        return body

    @staticmethod
    def _message_body(message: ChatMessage) -> dict[str, Any]:
        body: dict[str, Any] = {"role": message.role, "content": message.content}
        if message.images:
            body["images"] = list(message.images)
        if message.name:
            body["name"] = message.name
        return body

    async def chat(self, request: ChatRequest) -> AsyncIterator[ChatChunk]:
        """Stream a generation as NDJSON, yielding one chunk per line."""
        body = self._chat_body(request)
        timeout = (
            httpx.Timeout(request.timeout_s)
            if request.timeout_s is not None
            else httpx.USE_CLIENT_DEFAULT
        )
        try:
            async with self._client.stream(
                "POST", "/api/chat", json=body, timeout=timeout
            ) as response:
                if response.status_code >= 400:
                    detail = (await response.aread()).decode("utf-8", "replace")[:500]
                    raise RuntimeAdapterError(
                        f"Ollama chat failed with {response.status_code}: {detail}",
                        runtime_id=self.runtime_id,
                    )
                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    chunk = self._parse_chunk(line)
                    if chunk is not None:
                        yield chunk
        except httpx.HTTPError as exc:
            raise RuntimeUnreachable(
                f"Ollama unreachable at {self.base_url}: {exc}", runtime_id=self.runtime_id
            ) from exc

    def _parse_chunk(self, line: str) -> ChatChunk | None:
        try:
            payload = json.loads(line)
        except ValueError:
            return None
        if not isinstance(payload, dict):
            return None
        if error := payload.get("error"):
            raise RuntimeAdapterError(f"Ollama chat error: {error}", runtime_id=self.runtime_id)

        message = payload.get("message") or {}
        tool_calls = [
            ToolCall(
                name=(call.get("function") or {}).get("name", ""),
                arguments=(call.get("function") or {}).get("arguments") or {},
            )
            for call in message.get("tool_calls") or []
        ]
        return ChatChunk(
            delta=message.get("content") or "",
            done=bool(payload.get("done")),
            tool_calls=tool_calls,
            finish_reason=payload.get("done_reason"),
            prompt_tokens=payload.get("prompt_eval_count"),
            completion_tokens=payload.get("eval_count"),
            total_duration_ms=_ns_to_ms(payload.get("total_duration")),
            eval_duration_ms=_ns_to_ms(payload.get("eval_duration")),
        )

    # --- embeddings ------------------------------------------------------

    async def embed(self, texts: Sequence[str], model: str) -> EmbedResult:
        payload = await self._post("/api/embed", {"model": model, "input": list(texts)})
        raw = payload.get("embeddings") or []
        vectors = [[float(value) for value in vector] for vector in raw]
        if not vectors:
            raise RuntimeAdapterError(
                f"Ollama returned no embeddings for model {model}", runtime_id=self.runtime_id
            )
        return EmbedResult(vectors=vectors, model=model, dimensions=len(vectors[0]))
