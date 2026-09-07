"""Runtime adapters.

Implementation rule 3: every runtime-specific detail lives here and nowhere else.
``tests/unit/test_architecture.py`` enforces it.
"""

from vajra.runtimes.base import (
    ChatChunk,
    ChatMessage,
    ChatRequest,
    EmbedResult,
    ResidentModel,
    RuntimeAdapter,
    RuntimeHealth,
    RuntimeModelInfo,
    ToolCall,
    ToolDefinition,
)
from vajra.runtimes.factory import build_adapter
from vajra.runtimes.ollama import OllamaProvider
from vajra.runtimes.openai_compatible import OpenAICompatibleProvider
from vajra.runtimes.vllm import VLLMProvider

__all__ = [
    "ChatChunk",
    "ChatMessage",
    "ChatRequest",
    "EmbedResult",
    "OllamaProvider",
    "OpenAICompatibleProvider",
    "ResidentModel",
    "RuntimeAdapter",
    "RuntimeHealth",
    "RuntimeModelInfo",
    "ToolCall",
    "ToolDefinition",
    "VLLMProvider",
    "build_adapter",
]
