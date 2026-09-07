"""Adapter construction from a persisted runtime record.

Adding a runtime family is: write the adapter, add one line here, register a
``RuntimeRecord``. See ``docs/RUNTIMES.md``.
"""

from __future__ import annotations

from vajra.core.enums import RuntimeKind
from vajra.core.exceptions import ValidationError
from vajra.runtimes.base import RuntimeAdapter
from vajra.runtimes.ollama import OllamaProvider
from vajra.runtimes.openai_compatible import OpenAICompatibleProvider
from vajra.runtimes.vllm import VLLMProvider


def build_adapter(
    *,
    runtime_id: str,
    kind: RuntimeKind,
    base_url: str,
    api_key: str | None = None,
    request_timeout_s: float = 300.0,
    connect_timeout_s: float = 5.0,
    keep_alive: str = "30m",
) -> RuntimeAdapter:
    """Instantiate the adapter for a runtime kind."""
    if kind is RuntimeKind.OLLAMA:
        return OllamaProvider(
            runtime_id=runtime_id,
            base_url=base_url,
            request_timeout_s=request_timeout_s,
            connect_timeout_s=connect_timeout_s,
            keep_alive=keep_alive,
        )
    if kind is RuntimeKind.VLLM:
        return VLLMProvider(
            runtime_id=runtime_id,
            base_url=base_url,
            api_key=api_key,
            request_timeout_s=request_timeout_s,
            connect_timeout_s=connect_timeout_s,
        )
    if kind is RuntimeKind.OPENAI_COMPATIBLE:
        return OpenAICompatibleProvider(
            runtime_id=runtime_id,
            base_url=base_url,
            api_key=api_key,
            request_timeout_s=request_timeout_s,
            connect_timeout_s=connect_timeout_s,
        )
    raise ValidationError(f"Unknown runtime kind: {kind}", kind=str(kind))
