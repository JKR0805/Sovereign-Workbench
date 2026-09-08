"""Tests verifying model selection hierarchy, specialization scoring, and multi-turn document persistence."""

from __future__ import annotations

import pytest

from vajra.core.config import DatabaseSettings
from vajra.core.enums import Capability, HealthState, RuntimeKind
from vajra.events.bus import EventBus
from vajra.events.store import InMemoryEventStore
from vajra.orchestrator.conversations import ConversationService
from vajra.orchestrator.models import ConversationCreateRequest, RunAttachment
from vajra.router.classify import LexiconTaskClassifier
from vajra.router.engine import RouterEngine
from vajra.router.models import (
    ModelCandidate,
    RoutingContext,
    ScoringWeights,
    TaskComplexity,
    TaskFeatures,
    TaskIntent,
    TaskSpec,
)
from vajra.router.scoring import score_all, score_candidate
from vajra.store.database import Database


@pytest.mark.asyncio
async def test_classification_for_describe_and_explain() -> None:
    """Verify 'Describe...' and 'Explain...' route to general document understanding/analysis."""
    classifier = LexiconTaskClassifier()

    # 1. "Describe the attached files contents" -> SUMMARISE, preferred DOC_UNDERSTANDING & REASONING, non-coding
    spec_describe = await classifier.classify("task-1", "Describe the attached files contents")
    assert spec_describe.intent == TaskIntent.SUMMARISE
    assert Capability.DOC_UNDERSTANDING in spec_describe.preferred_caps
    assert Capability.REASONING in spec_describe.preferred_caps
    assert Capability.CODING not in spec_describe.required_caps
    assert spec_describe.is_coding_task is False

    # 2. "Explain this document" -> ANALYSE, non-coding
    spec_explain = await classifier.classify("task-2", "Explain this document")
    assert spec_explain.intent == TaskIntent.ANALYSE
    assert Capability.CODING not in spec_explain.required_caps
    assert spec_explain.is_coding_task is False

    # 3. "Write a Python script to parse this CSV" -> CODE, coding-specialist
    spec_code = await classifier.classify("task-3", "Write a Python script to parse this CSV")
    assert spec_code.intent == TaskIntent.CODE
    assert Capability.CODING in spec_code.required_caps
    assert spec_code.is_coding_task is True


def test_scoring_general_task_beats_resident_coding_model() -> None:
    """Verify general reasoning model wins a general document request even when coding model is resident in VRAM."""
    coding_specialist = ModelCandidate(
        model_id="coding-specialist",
        runtime_id="rt-local",
        runtime_kind=RuntimeKind.OLLAMA,
        context_window=8192,
        health=HealthState.HEALTHY,
        priority=75,
        resident=True,  # Resident in VRAM!
        capabilities={Capability.TEXT: 0.85, Capability.CODING: 0.95},
    )

    general_reasoning = ModelCandidate(
        model_id="general-reasoning",
        runtime_id="rt-local",
        runtime_kind=RuntimeKind.OLLAMA,
        context_window=8192,
        health=HealthState.HEALTHY,
        priority=85,
        resident=False,  # Not resident in VRAM!
        capabilities={Capability.TEXT: 0.90, Capability.REASONING: 0.85},
    )

    # General document-understanding task
    spec_general = TaskSpec(
        task_id="t-describe",
        prompt="Describe the attached files contents",
        intent=TaskIntent.SUMMARISE,
        complexity=TaskComplexity.LOW,
        required_caps=frozenset({Capability.TEXT}),
        preferred_caps=frozenset({Capability.DOC_UNDERSTANDING, Capability.REASONING}),
        is_coding_task=False,
        features=TaskFeatures(estimated_input_tokens=500),
    )

    context = RoutingContext(resident_model_ids=frozenset({"coding-specialist"}))
    weights = ScoringWeights()

    scores = score_all([coding_specialist, general_reasoning], spec_general, context, weights)
    
    # general-reasoning must win despite not being resident in VRAM
    assert scores[0].model_id == "general-reasoning"
    assert scores[0].total > scores[1].total

    engine = RouterEngine()
    decision = engine.route(spec_general, [coding_specialist, general_reasoning], context)
    assert decision.selected == "general-reasoning"


def test_scoring_coding_task_selects_coding_specialist() -> None:
    """Verify coding specialist wins for an actual coding request."""
    coding_specialist = ModelCandidate(
        model_id="coding-specialist",
        runtime_id="rt-local",
        runtime_kind=RuntimeKind.OLLAMA,
        context_window=8192,
        health=HealthState.HEALTHY,
        priority=75,
        resident=False,
        capabilities={Capability.TEXT: 0.85, Capability.CODING: 0.95},
    )

    general_reasoning = ModelCandidate(
        model_id="general-reasoning",
        runtime_id="rt-local",
        runtime_kind=RuntimeKind.OLLAMA,
        context_window=8192,
        health=HealthState.HEALTHY,
        priority=85,
        resident=True,
        capabilities={Capability.TEXT: 0.90, Capability.REASONING: 0.85},
    )

    spec_code = TaskSpec(
        task_id="t-code",
        prompt="Write a Python script to parse this CSV",
        intent=TaskIntent.CODE,
        complexity=TaskComplexity.MEDIUM,
        required_caps=frozenset({Capability.CODING}),
        preferred_caps=frozenset({Capability.STRUCTURED_OUTPUT}),
        is_coding_task=True,
        features=TaskFeatures(estimated_input_tokens=500),
    )

    context = RoutingContext(resident_model_ids=frozenset({"general-reasoning"}))
    engine = RouterEngine()
    decision = engine.route(spec_code, [coding_specialist, general_reasoning], context)
    assert decision.selected == "coding-specialist"


@pytest.mark.asyncio
async def test_multi_turn_conversation_document_persistence(tmp_path) -> None:
    """Verify documents uploaded in Turn 1 are retained in effective conversation context for Turn 2."""
    db_path = tmp_path / "test_persistence.db"
    settings = DatabaseSettings(path=db_path)
    database = Database(settings)
    await database.init()
    events = EventBus(InMemoryEventStore())
    conv_service = ConversationService(database, events)

    # 1. Create a conversation
    conv = await conv_service.create(ConversationCreateRequest(title="Test Document Chat"))

    # 2. Turn 1: Attach Python Cheat Sheet.pdf
    turn_1 = await conv_service.open_turn(
        conv.id,
        prompt="Explain the decorators section.",
        attachments=[
            {
                "filename": "Python Cheat Sheet.pdf",
                "mime": "application/pdf",
                "size_bytes": 279121,
                "document_id": "doc-python-cheat-sheet-999",
                "kind": "document",
            }
        ],
    )
    assert turn_1 is not None

    # Check that documents_for returns the attached document
    docs = await conv_service.documents_for(conv.id)
    assert len(docs) == 1
    assert docs[0]["document_id"] == "doc-python-cheat-sheet-999"
    assert docs[0]["filename"] == "Python Cheat Sheet.pdf"

    # 3. Turn 2: Follow-up question without re-attaching
    turn_2 = await conv_service.open_turn(
        conv.id,
        prompt="Summarize its key points.",
        attachments=[],  # Empty current turn attachments!
    )
    assert turn_2 is not None

    # Verify conversation still yields the effective document
    effective_docs = await conv_service.documents_for(conv.id)
    assert len(effective_docs) == 1
    assert effective_docs[0]["document_id"] == "doc-python-cheat-sheet-999"

    # Simulate orchestrator's effective_attachments logic
    current_attachments: list[RunAttachment] = []
    effective_attachments: list[RunAttachment] = list(current_attachments)
    inherited_count = 0

    conv_docs = await conv_service.documents_for(turn_2.conversation_id)
    curr_doc_ids = {a.document_id for a in effective_attachments if a.document_id}

    for doc in conv_docs:
        doc_id = doc.get("document_id")
        if doc_id and doc_id not in curr_doc_ids:
            effective_attachments.append(
                RunAttachment(
                    filename=doc.get("filename") or "document",
                    mime=doc.get("mime") or "application/octet-stream",
                    size_bytes=doc.get("size_bytes") or 0,
                    document_id=doc_id,
                    kind="document",
                )
            )
            inherited_count += 1

    assert len(effective_attachments) == 1
    assert inherited_count == 1
    assert effective_attachments[0].document_id == "doc-python-cheat-sheet-999"

    await database.dispose()
