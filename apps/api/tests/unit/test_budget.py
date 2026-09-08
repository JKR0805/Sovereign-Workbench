"""Unit tests for history budgeting (Phase 2 of the implementation plan)."""

from __future__ import annotations

from vajra.orchestrator.budget import (
    CHARS_PER_TOKEN,
    HistoryTurn,
    budget_history,
    history_budget_tokens,
)


def _turn(role: str, content: str, ordinal: int) -> HistoryTurn:
    return HistoryTurn(role=role, content=content, message_id=f"m{ordinal}", ordinal=ordinal)


def test_budget_history_keeps_newest_first_within_budget() -> None:
    turns = [_turn("user" if i % 2 == 0 else "assistant", "x" * 40, i) for i in range(10)]
    result = budget_history(turns, budget_tokens=20, min_turns=2)  # 20*4=80 chars budget

    # Newest-first accumulation: the tail of the original (oldest-first) list
    # is what gets kept, since that's what's closest to "now".
    assert [t.ordinal for t in result.turns] == [8, 9]
    assert result.dropped_turns == 8
    assert result.truncated_chars == 0


def test_budget_history_always_keeps_min_turns_even_over_budget() -> None:
    turns = [_turn("user", "y" * 1000, 0), _turn("assistant", "z" * 1000, 1)]
    result = budget_history(turns, budget_tokens=1, min_turns=2)

    assert len(result.turns) == 2
    assert result.dropped_turns == 0
    # The oldest of the two forced-kept turns absorbs the truncation, not the
    # most recent one.
    assert result.truncated_chars > 0
    assert result.turns[0].content.endswith("]")
    assert "truncated" in result.turns[0].content
    assert result.turns[1].content == "z" * 1000


def test_budget_history_exact_dropped_count() -> None:
    turns = [_turn("user", "a" * 4, i) for i in range(6)]  # 1 token each
    result = budget_history(turns, budget_tokens=3, min_turns=1)
    assert result.dropped_turns == 3
    assert len(result.turns) == 3


def test_budget_history_empty_input() -> None:
    result = budget_history([], budget_tokens=1000, min_turns=2)
    assert result.turns == []
    assert result.dropped_turns == 0
    assert result.truncated_chars == 0
    assert result.estimated_tokens == 0


def test_history_budget_tokens_arithmetic() -> None:
    budget = history_budget_tokens(
        num_ctx=8192,
        max_output_tokens=2048,
        system_tokens=250,
        retrieval_tokens=2100,
        prompt_tokens=200,
        safety_margin_tokens=0,
    )
    assert budget == 8192 - 2048 - 250 - 2100 - 200


def test_history_budget_tokens_clamps_to_floor() -> None:
    budget = history_budget_tokens(
        num_ctx=1000,
        max_output_tokens=2048,
        system_tokens=250,
        retrieval_tokens=2100,
        prompt_tokens=200,
        floor=512,
    )
    assert budget == 512


def test_chars_per_token_matches_router_classifier() -> None:
    """This constant is intentionally duplicated (see budget.py's module
    docstring) rather than imported, so this test is the tripwire that keeps
    the two in sync."""
    from vajra.router.classify import CHARS_PER_TOKEN as ROUTER_CHARS_PER_TOKEN

    assert CHARS_PER_TOKEN == ROUTER_CHARS_PER_TOKEN
