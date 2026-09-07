"""Unit tests for the router engine, classifiers, filters, and scoring."""

from __future__ import annotations

import inspect

import pytest

from vajra.core.enums import Capability, HealthState, RuntimeKind
from vajra.core.exceptions import NoCandidateModels
from vajra.router.classify import LexiconTaskClassifier
from vajra.router.engine import RouterEngine
from vajra.router.models import (
    ModelCandidate,
    TaskComplexity,
    TaskFeatures,
    TaskIntent,
    TaskSpec,
)


@pytest.mark.asyncio
async def test_lexicon_classifier() -> None:
    """Lexicon classifier identifies domain, complexity, and capabilities."""
    classifier = LexiconTaskClassifier()

    code_spec = await classifier.classify(
        "task-1", "Write a Python script to parse json and calculate statistics"
    )
    assert code_spec.intent == TaskIntent.CODE
    assert Capability.CODING in code_spec.required_caps

    summary_spec = await classifier.classify(
        "task-2", "Summarize this document in brief for the team"
    )
    assert summary_spec.intent == TaskIntent.SUMMARISE


def test_router_model_agnostic_architecture() -> None:
    """The router module must not have hardcoded vendor model names in its routing logic."""
    import vajra.router.classify as classify_mod
    import vajra.router.engine as engine_mod
    import vajra.router.filters as filters_mod
    import vajra.router.scoring as scoring_mod

    forbidden_names = ["llama", "mistral", "deepseek", "qwen", "claude", "gpt-4", "gemini"]

    for mod in (engine_mod, filters_mod, scoring_mod, classify_mod):
        source = inspect.getsource(mod).lower()
        for forbidden in forbidden_names:
            assert (
                f'"{forbidden}"' not in source and f"'{forbidden}'" not in source
            ), f"Module {mod.__name__} contains hardcoded model name '{forbidden}'"


def test_router_selects_best_candidate() -> None:
    """Router selects candidate with highest capability and quality score."""
    engine = RouterEngine()

    candidates = [
        ModelCandidate(
            model_id="generic-small",
            runtime_id="rt-local",
            runtime_kind=RuntimeKind.OLLAMA,
            context_window=4096,
            health=HealthState.HEALTHY,
            priority=50,
            capabilities={Capability.TEXT: 0.7},
        ),
        ModelCandidate(
            model_id="code-specialist",
            runtime_id="rt-local",
            runtime_kind=RuntimeKind.OLLAMA,
            context_window=32768,
            health=HealthState.HEALTHY,
            priority=80,
            capabilities={Capability.TEXT: 0.9, Capability.CODING: 0.95},
        ),
    ]

    spec = TaskSpec(
        task_id="t-1",
        prompt="Write python code to sort files",
        intent=TaskIntent.CODE,
        complexity=TaskComplexity.MEDIUM,
        required_caps=frozenset({Capability.CODING}),
        features=TaskFeatures(estimated_input_tokens=1000),
    )

    decision = engine.route(spec, candidates)
    assert decision.selected == "code-specialist"
    assert len(decision.candidates) == 1
    assert any(r.model_id == "generic-small" for r in decision.rejected)


def test_router_rejects_insufficient_context() -> None:
    """Candidates with context window smaller than estimated tokens * margin are rejected."""
    engine = RouterEngine()

    candidate = ModelCandidate(
        model_id="tiny-ctx",
        runtime_id="rt-local",
        runtime_kind=RuntimeKind.OLLAMA,
        context_window=1000,
        health=HealthState.HEALTHY,
        capabilities={Capability.TEXT: 0.8},
    )

    spec = TaskSpec(
        task_id="t-2",
        prompt="Read this huge text...",
        intent=TaskIntent.QUESTION_ANSWER,
        complexity=TaskComplexity.LOW,
        required_caps=frozenset(),
        features=TaskFeatures(estimated_input_tokens=900),  # 900 * 1.3 = 1170 > 1000
    )

    with pytest.raises(NoCandidateModels) as exc_info:
        engine.route(spec, [candidate])

    assert exc_info.value.context.get("task_id") == "t-2"
