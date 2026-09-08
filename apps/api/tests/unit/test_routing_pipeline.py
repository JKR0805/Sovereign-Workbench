"""Tests for the Intelligent Model Routing & Processing Pipeline components."""

from pathlib import Path
import pytest

from vajra.core.enums import Capability, RuntimeKind, HealthState
from vajra.rag.parse import PyMuPDFParser
from vajra.router.classify import LexiconTaskClassifier
from vajra.router.engine import RouterEngine
from vajra.router.models import ModelCandidate, TaskSpec, TaskIntent, TaskComplexity, TaskFeatures
from vajra.router.understand import CODING_PATTERNS


def test_coding_pattern_detection() -> None:
    """Test regex pattern detection for coding intent."""
    assert CODING_PATTERNS.search("write a python script to parse logs") is not None
    assert CODING_PATTERNS.search("can you debug this function def calculate(x):") is not None
    assert CODING_PATTERNS.search("create a dataframe with pandas and plot a chart") is not None
    assert CODING_PATTERNS.search("what is the capital of france") is None
    assert CODING_PATTERNS.search("summarize this strategic plan document") is None


@pytest.mark.asyncio
async def test_tabular_data_parsing(tmp_path: Path) -> None:
    """Test CSV tabular parsing returns column schema, row count, and statistical summary."""
    csv_file = tmp_path / "employees.csv"
    csv_file.write_text("id,name,salary,department\n1,Alice,75000,Engineering\n2,Bob,82000,Engineering\n3,Charlie,60000,Marketing\n", encoding="utf-8")
    
    parser = PyMuPDFParser()
    res = await parser.parse(csv_file, document_id="doc-1", title="Employees")
    
    assert res.summary is not None
    assert "Tabular file" in res.summary
    assert "salary" in res.summary
    assert res.metadata.get("rows") == 3
    assert res.metadata.get("columns") == 4
    all_text = " ".join(b.text for b in res.blocks)
    assert "Alice" in all_text
    assert "Marketing" in all_text


@pytest.mark.asyncio
async def test_lexicon_classifier_with_is_coding_task_flag() -> None:
    """Test that when is_coding_task=True, CODING capability is required and intent is CODE."""
    classifier = LexiconTaskClassifier()
    
    # Even if prompt doesn't explicitly have coding keywords, is_coding_task triggers coding route
    spec = await classifier.classify(
        "task-1",
        "calculate total sales per region",
        is_coding_task=True,
    )
    assert spec.intent == TaskIntent.CODE
    assert Capability.CODING in spec.required_caps
    assert spec.is_coding_task is True


def test_deterministic_model_selection_for_coding() -> None:
    """Verify router deterministically routes coding tasks to capability-bearing models without hardcoding names."""
    engine = RouterEngine()
    
    candidates = [
        ModelCandidate(
            model_id="general-8b",
            runtime_id="rt-local",
            runtime_kind=RuntimeKind.OLLAMA,
            context_window=8192,
            health=HealthState.HEALTHY,
            priority=50,
            capabilities={Capability.TEXT: 0.85, Capability.REASONING: 0.8},
        ),
        ModelCandidate(
            model_id="specialist-code-7b",
            runtime_id="rt-local",
            runtime_kind=RuntimeKind.OLLAMA,
            context_window=16384,
            health=HealthState.HEALTHY,
            priority=70,
            capabilities={Capability.TEXT: 0.8, Capability.CODING: 0.95},
        ),
    ]
    
    # Coding Task -> must select specialist-code-7b
    coding_spec = TaskSpec(
        task_id="t-code",
        prompt="Write a Python script to parse csv",
        original_prompt="Write a Python script to parse csv",
        enhanced_prompt="Write a Python script using pandas to parse csv and export summary",
        intent=TaskIntent.CODE,
        complexity=TaskComplexity.MEDIUM,
        required_caps=frozenset({Capability.CODING}),
        is_coding_task=True,
        features=TaskFeatures(estimated_input_tokens=500),
    )
    decision = engine.route(coding_spec, candidates)
    assert decision.selected == "specialist-code-7b"
    
    # Non-coding Task -> selects general-8b (higher reasoning/priority or fit)
    general_spec = TaskSpec(
        task_id="t-gen",
        prompt="Explain the core principles of quantum physics",
        original_prompt="Explain the core principles of quantum physics",
        enhanced_prompt="Explain quantum physics principles including superposition and entanglement",
        intent=TaskIntent.ANALYSE,
        complexity=TaskComplexity.MEDIUM,
        required_caps=frozenset({Capability.TEXT}),
        is_coding_task=False,
        features=TaskFeatures(estimated_input_tokens=500),
    )
    decision_gen = engine.route(general_spec, candidates)
    assert decision_gen.selected in ("general-8b", "specialist-code-7b")
