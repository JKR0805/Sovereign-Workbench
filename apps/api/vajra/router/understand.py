"""Semantic understanding engine (Stage 2 in the 8-stage pipeline).

Separates semantic prompt understanding (General Model) from deterministic
execution routing (Router Engine).

Preserves `original_prompt` as the immutable authority of user intent,
while deriving `enhanced_prompt` for vector retrieval and downstream context.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Sequence
from pydantic import BaseModel, ConfigDict, Field

from vajra.core.enums import Capability
from vajra.registry.service import ModelRegistry
from vajra.registry.runtimes import RuntimeManager
from vajra.runtimes.base import ChatMessage, ChatRequest

logger = logging.getLogger(__name__)

UNDERSTANDING_SYSTEM_PROMPT = """You are the Semantic Query Understanding Engine for Sovereign Workbench.
Analyze the user's request and any attached file summary.

Your objectives:
1. Preserve the user's exact original goal and intent.
2. Formulate an 'enhanced_prompt': expand abbreviations, specify technical keywords, data entities, and domain concepts to optimize downstream vector knowledge retrieval (RAG).
3. Determine whether the request requires software engineering / programming / script execution (is_coding_task: true) or general knowledge / explanation / document analysis (is_coding_task: false).
4. List key technical capabilities required (e.g., "coding", "reasoning", "tabular_analysis", "doc_understanding").

Respond ONLY with valid JSON in this exact structure:
{
  "enhanced_prompt": "<expanded, keyword-dense query for vector search>",
  "is_coding_task": true or false,
  "intent": "<concise summary of actual user intent>",
  "suggested_capabilities": ["<capability_name>", ...]
}
"""

CODING_PATTERNS = re.compile(
    r"\b(code|script|python|javascript|typescript|function|def\s+\w+|class\s+\w+|"
    r"algorithm|debug|refactor|sql|query|endpoint|api|html|css|regex|program|"
    r"implement|pandas|dataframe|numpy|matplotlib|plot|chart|automatt?ion)\b",
    re.IGNORECASE,
)


class SemanticUnderstanding(BaseModel):
    """Normalized output of the General Model semantic understanding stage."""

    model_config = ConfigDict(frozen=True)

    original_prompt: str
    enhanced_prompt: str
    is_coding_task: bool
    intent: str
    suggested_capabilities: list[str] = Field(default_factory=list)
    understanding_source: str = "general_model"  # "general_model" or "heuristic_fallback"


class SemanticUnderstandingEngine:
    """Invokes the General Model for prompt enhancement and semantic interpretation,
    falling back to deterministic heuristics if unavailable."""

    def __init__(
        self,
        *,
        registry: ModelRegistry,
        runtimes: RuntimeManager,
    ) -> None:
        self._registry = registry
        self._runtimes = runtimes

    async def understand(
        self,
        original_prompt: str,
        *,
        extracted_file_context: str | None = None,
        history_summary: str | None = None,
    ) -> SemanticUnderstanding:
        """Analyze original_prompt with the General Model, or degrade to heuristics."""
        clean_original = original_prompt.strip()

        # Build context for the General Model
        context_parts = []
        if extracted_file_context:
            context_parts.append(f"### ATTACHED FILE CONTEXT\n{extracted_file_context.strip()}")
        if history_summary:
            context_parts.append(f"### CONVERSATION HISTORY\n{history_summary.strip()}")
        context_parts.append(f"### USER PROMPT\n{clean_original}")

        user_content = "\n\n".join(context_parts)

        # Attempt General Model semantic query
        try:
            candidates = await self._registry.list(enabled_only=True)
            # Select general-purpose reasoning model (specifically requires REASONING capability and excludes vision specialists)
            general_candidates = [
                m
                for m in candidates
                if Capability.REASONING.value in m.capabilities
                and Capability.VISION.value not in m.capabilities
                and (Capability.CODING.value not in m.capabilities or len(m.capabilities) > 2)
            ]
            general_model = next(iter(general_candidates), None)

            if general_model is not None:
                adapter = await self._runtimes.adapter(general_model.runtime_id)
                request = ChatRequest(
                    model=general_model.runtime_model_id,
                    messages=[
                        ChatMessage(role="system", content=UNDERSTANDING_SYSTEM_PROMPT),
                        ChatMessage(role="user", content=user_content),
                    ],
                    stream=False,
                    max_output_tokens=350,
                    temperature=0.1,
                )

                reply_parts: list[str] = []
                async for chunk in adapter.chat(request):
                    if chunk.delta:
                        reply_parts.append(chunk.delta)

                raw_reply = "".join(reply_parts).strip()
                # Parse JSON block
                json_match = re.search(r"\{[\s\S]*\}", raw_reply)
                if json_match:
                    parsed = json.loads(json_match.group(0))
                    enhanced = str(parsed.get("enhanced_prompt") or "").strip()
                    is_coding = bool(parsed.get("is_coding_task", False))
                    intent = str(parsed.get("intent") or "user request").strip()
                    caps = [str(c).lower() for c in parsed.get("suggested_capabilities", [])]

                    # Defensive check: if original prompt explicitly contains coding fences or coding keywords, enforce coding
                    if bool(CODING_PATTERNS.search(clean_original)):
                        is_coding = True

                    return SemanticUnderstanding(
                        original_prompt=clean_original,
                        enhanced_prompt=enhanced or clean_original,
                        is_coding_task=is_coding,
                        intent=intent,
                        suggested_capabilities=caps,
                        understanding_source="general_model",
                    )
        except Exception as exc:
            logger.info("General Model semantic understanding degraded to heuristic: %s", exc)

        # Heuristic degradation
        return self._heuristic_fallback(clean_original, extracted_file_context)

    def _heuristic_fallback(
        self, original_prompt: str, extracted_file_context: str | None
    ) -> SemanticUnderstanding:
        """Deterministic fallback when General Model is unreachable or times out."""
        is_coding = bool(CODING_PATTERNS.search(original_prompt))
        if extracted_file_context and any(
            ext in extracted_file_context.lower() for ext in (".py", ".js", ".ts", "schema", "csv")
        ):
            if any(w in original_prompt.lower() for w in ("plot", "chart", "analyze", "detect", "parse")):
                is_coding = True

        # Generate enhanced prompt for search
        enhanced_parts = [original_prompt]
        if extracted_file_context:
            # Extract first line of summary
            first_line = extracted_file_context.strip().splitlines()[0]
            enhanced_parts.append(first_line)

        enhanced_query = " ".join(enhanced_parts)

        return SemanticUnderstanding(
            original_prompt=original_prompt,
            enhanced_prompt=enhanced_query,
            is_coding_task=is_coding,
            intent="coding and implementation" if is_coding else "analysis and information",
            suggested_capabilities=["coding"] if is_coding else ["text", "reasoning"],
            understanding_source="heuristic_fallback",
        )
