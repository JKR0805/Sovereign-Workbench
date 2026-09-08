"""Task classification (Section F, stage 1).

Deterministic-dominant hybrid. :func:`extract_features` produces hard facts from
the prompt and its attachments; those facts can never be overridden. A cheap LLM
classifier then supplies intent, domain and complexity, and the deterministic
overrides are re-applied on top of whatever it says.

What is implemented here is the deterministic half plus the keyword-lexicon
fallback, which is exactly the degradation path Section F requires: "If the
classifier fails or returns malformed JSON, fall back to a keyword lexicon. The
router must never fail; it degrades."

The LLM classifier is a separate implementation of :class:`TaskClassifier`; the
protocol exists so it can be dropped in without touching anything downstream.
See ``docs/ROUTING.md``.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from typing import Protocol

from pydantic import BaseModel, ConfigDict

from vajra.core.enums import Capability
from vajra.router.models import (
    TaskComplexity,
    TaskFeatures,
    TaskIntent,
    TaskSpec,
)

#: Rough characters-per-token used only for pre-flight sizing. Labelled an
#: estimate everywhere it surfaces; the real count comes from the runtime.
CHARS_PER_TOKEN = 4

IMAGE_MIME_PREFIXES = ("image/",)
TABULAR_MIMES = frozenset(
    {
        "text/csv",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }
)
CODE_EXTENSIONS = frozenset(
    {".py", ".js", ".ts", ".tsx", ".java", ".go", ".rs", ".c", ".cpp", ".h", ".sql", ".sh"}
)

#: Verb + noun pairs that mean "produce a file", per Section F.
FILE_OUTPUT_PATTERN = re.compile(
    r"\b(generate|create|produce|draft|write|export|build|prepare)\b[^.]{0,60}?"
    r"\b(report|note|document|docx|xlsx|pptx|pdf|spreadsheet|deck|memo|summary sheet)\b",
    re.IGNORECASE,
)

CODE_FENCE_PATTERN = re.compile(r"```|\bdef \w+\(|\bclass \w+\b|\bimport \w+", re.MULTILINE)

#: Keyword lexicon. This is the fallback classifier, not a routing table: it maps
#: language to intent, and intent to capability requirements. No model appears.
INTENT_LEXICON: dict[TaskIntent, tuple[str, ...]] = {
    TaskIntent.CODE: (
        "code", "script", "python", "function", "debug", "refactor", "compute",
        "calculate", "plot", "chart", "aggregate", "statistics",
    ),
    TaskIntent.EXTRACT: (
        "extract", "read out", "list all", "tag numbers", "transcribe", "pull out",
        "identify the", "find all",
    ),
    TaskIntent.SUMMARISE: (
        "summarise", "summarize", "tl;dr", "condense", "brief",
        "describe", "describe the", "overview", "walk through", "outline", "tell me about",
    ),
    TaskIntent.DOCUMENT_GENERATION: (
        "approval note", "generate a report", "draft a", "write a report", "prepare a note",
    ),
    TaskIntent.ANALYSE: (
        "analyse", "analyze", "assess", "evaluate", "compare", "interpret", "diagnose",
        "root cause", "why", "explain", "inspect", "review", "break down",
    ),
    TaskIntent.QUESTION_ANSWER: ("what", "when", "who", "where", "which", "how many"),
}

#: Capabilities each intent prefers. Preferences, not requirements: a missing
#: preferred capability lowers a score, it does not eliminate a model.
INTENT_PREFERRED_CAPS: dict[TaskIntent, frozenset[Capability]] = {
    TaskIntent.CODE: frozenset({Capability.CODING, Capability.STRUCTURED_OUTPUT}),
    TaskIntent.EXTRACT: frozenset({Capability.DOC_UNDERSTANDING, Capability.STRUCTURED_OUTPUT}),
    TaskIntent.SUMMARISE: frozenset(
        {Capability.TEXT, Capability.DOC_UNDERSTANDING, Capability.REASONING}
    ),
    TaskIntent.ANALYSE: frozenset({Capability.REASONING}),
    TaskIntent.DOCUMENT_GENERATION: frozenset(
        {Capability.REASONING, Capability.STRUCTURED_OUTPUT}
    ),
    TaskIntent.QUESTION_ANSWER: frozenset({Capability.TEXT, Capability.REASONING}),
    TaskIntent.UNKNOWN: frozenset({Capability.TEXT, Capability.REASONING}),
}

#: Above this estimate, a task needs a long-context model (Section F, stage 1).
LONG_CONTEXT_TOKEN_THRESHOLD = 24_000

COMPLEXITY_TOKEN_THRESHOLD = 8_000


class Attachment(BaseModel):
    """An input file, as far as classification is concerned."""

    model_config = ConfigDict(frozen=True)

    filename: str
    mime: str
    size_bytes: int = 0
    page_count: int | None = None
    scanned_page_count: int | None = None
    extracted_chars: int | None = None
    extracted_summary: str | None = None
    requires_multimodal: bool = False


def extract_features(
    prompt: str,
    attachments: Sequence[Attachment] = (),
    *,
    extra_input_chars: int = 0,
) -> TaskFeatures:
    """Deterministic feature extraction. Hard facts only.

    ``estimated_input_tokens`` is explicitly an estimate derived from character
    counts. It is used for context sizing, which is a filter with a 1.3x margin,
    not for anything a user is shown as a measurement.

    ``extra_input_chars`` folds in anything else that will occupy the prompt
    besides the message text itself -- conversation history, a system preamble --
    so the context filter sizes against what will actually be sent, not just the
    latest turn.
    """
    attachment_types = [attachment.mime for attachment in attachments]

    has_image = any(
        attachment.mime.startswith(IMAGE_MIME_PREFIXES) for attachment in attachments
    )
    has_scanned = any(
        (attachment.scanned_page_count or 0) > 0 for attachment in attachments
    )
    has_tabular = any(attachment.mime in TABULAR_MIMES for attachment in attachments)
    has_code = bool(CODE_FENCE_PATTERN.search(prompt)) or any(
        any(attachment.filename.lower().endswith(ext) for ext in CODE_EXTENSIONS)
        for attachment in attachments
    )

    characters = (
        len(prompt)
        + sum(attachment.extracted_chars or 0 for attachment in attachments)
        + max(0, extra_input_chars)
    )
    estimated_tokens = characters // CHARS_PER_TOKEN

    return TaskFeatures(
        has_image_input=has_image,
        has_scanned_pages=has_scanned,
        has_tabular_input=has_tabular,
        has_code_input=has_code,
        estimated_input_tokens=estimated_tokens,
        attachment_types=attachment_types,
        requires_file_output=bool(FILE_OUTPUT_PATTERN.search(prompt)),
    )


def apply_deterministic_overrides(
    required: frozenset[Capability],
    features: TaskFeatures,
    intent: TaskIntent,
    *,
    is_coding_task: bool = False,
) -> frozenset[Capability]:
    """Section F: the overrides a classifier cannot argue with."""
    caps = set(required)
    if features.has_image_input or features.has_scanned_pages:
        caps.add(Capability.VISION)
    if features.has_code_input or intent is TaskIntent.CODE or is_coding_task:
        caps.add(Capability.CODING)
    if features.estimated_input_tokens > LONG_CONTEXT_TOKEN_THRESHOLD:
        caps.add(Capability.LONG_CONTEXT)
    if not caps:
        caps.add(Capability.TEXT)
    return frozenset(caps)


def infer_intent(prompt: str, features: TaskFeatures, *, is_coding_task: bool = False) -> TaskIntent:
    """Keyword-lexicon intent inference. The deterministic fallback."""
    if is_coding_task:
        return TaskIntent.CODE
    lowered = prompt.lower()
    best_intent = TaskIntent.UNKNOWN
    best_hits = 0
    for intent, keywords in INTENT_LEXICON.items():
        hits = sum(1 for keyword in keywords if keyword in lowered)
        if hits > best_hits:
            best_intent, best_hits = intent, hits
    if best_hits == 0:
        if features.requires_file_output:
            return TaskIntent.DOCUMENT_GENERATION
        if features.has_tabular_input:
            return TaskIntent.CODE
        return TaskIntent.UNKNOWN
    if features.requires_file_output and best_intent in {
        TaskIntent.SUMMARISE,
        TaskIntent.ANALYSE,
        TaskIntent.UNKNOWN,
    }:
        return TaskIntent.DOCUMENT_GENERATION
    return best_intent


def infer_complexity(prompt: str, features: TaskFeatures, intent: TaskIntent) -> TaskComplexity:
    signals = 0
    if features.estimated_input_tokens > COMPLEXITY_TOKEN_THRESHOLD:
        signals += 1
    if features.has_image_input or features.has_scanned_pages:
        signals += 1
    if features.requires_file_output:
        signals += 1
    if intent in {TaskIntent.ANALYSE, TaskIntent.CODE, TaskIntent.DOCUMENT_GENERATION}:
        signals += 1
    if len(prompt) > 400:
        signals += 1
    if signals >= 3:
        return TaskComplexity.HIGH
    if signals >= 1:
        return TaskComplexity.MEDIUM
    return TaskComplexity.LOW


class TaskClassifier(Protocol):
    """Produces a :class:`TaskSpec` from a prompt and its attachments."""

    name: str

    async def classify(
        self,
        task_id: str,
        prompt: str,
        attachments: Sequence[Attachment] = (),
        *,
        extra_input_chars: int = 0,
        original_prompt: str | None = None,
        enhanced_prompt: str | None = None,
        is_coding_task: bool = False,
    ) -> TaskSpec: ...


class LexiconTaskClassifier:
    """Deterministic classifier. Real, complete, and dependency-free.

    Also the fallback for the future LLM classifier. It cannot fail, which is the
    property Section F asks for.
    """

    name = "lexicon"

    async def classify(
        self,
        task_id: str,
        prompt: str,
        attachments: Sequence[Attachment] = (),
        *,
        extra_input_chars: int = 0,
        original_prompt: str | None = None,
        enhanced_prompt: str | None = None,
        is_coding_task: bool = False,
    ) -> TaskSpec:
        eval_prompt = original_prompt or prompt
        features = extract_features(eval_prompt, attachments, extra_input_chars=extra_input_chars)
        intent = infer_intent(eval_prompt, features, is_coding_task=is_coding_task)
        required = apply_deterministic_overrides(
            frozenset(), features, intent, is_coding_task=is_coding_task
        )
        preferred = INTENT_PREFERRED_CAPS.get(intent, frozenset()) - required
        return TaskSpec(
            task_id=task_id,
            prompt=prompt,
            original_prompt=original_prompt or prompt,
            enhanced_prompt=enhanced_prompt or prompt,
            is_coding_task=is_coding_task or (intent == TaskIntent.CODE),
            intent=intent,
            complexity=infer_complexity(eval_prompt, features, intent),
            required_caps=required,
            preferred_caps=preferred,
            features=features,
            classifier=self.name,
        )
