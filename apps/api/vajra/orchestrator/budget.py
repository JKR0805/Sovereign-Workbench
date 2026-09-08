"""History budgeting.

A conversation's stored turns cannot always fit in the model's context window
alongside the system preamble, retrieved chunks and the reserved generation
budget. This module decides how many of the most recent turns to keep, and does
it as a pure function of measured inputs so it is unit-testable without a
database or a model.

The two rules that matter:

- Newest-first accumulation, whole turns only, until the budget is spent.
- At least ``min_turns`` are always kept (truncating the oldest kept turn's
  content if necessary) so the model never loses the immediately preceding
  exchange, and the drop is always reported rather than silently absorbed --
  see :class:`BudgetedHistory`.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

#: Mirrors ``vajra.router.classify.CHARS_PER_TOKEN``. Kept as a local constant
#: rather than an import so this module stays dependency-free and testable in
#: isolation; the two are re-synchronised by the shared unit test.
CHARS_PER_TOKEN = 4

#: Tokens reserved for whatever else must fit alongside history, when the
#: caller does not supply a more precise breakdown.
DEFAULT_SAFETY_MARGIN_TOKENS = 128


@dataclass(frozen=True, slots=True)
class HistoryTurn:
    role: str
    content: str
    message_id: str
    ordinal: int


@dataclass(frozen=True, slots=True)
class BudgetedHistory:
    turns: list[HistoryTurn]
    dropped_turns: int
    truncated_chars: int
    estimated_tokens: int
    estimated_chars: int
    budget_tokens: int

    def as_dict(self) -> dict[str, object]:
        """The shape recorded on the classify step's output and on
        ``TASK_CLASSIFIED``, so a truncation is visible in the run inspector
        rather than silently changing the model's answer."""
        return {
            "turns_kept": len(self.turns),
            "turns_dropped": self.dropped_turns,
            "truncated_chars": self.truncated_chars,
            "estimated_tokens": self.estimated_tokens,
            "budget_tokens": self.budget_tokens,
        }


def history_budget_tokens(
    *,
    num_ctx: int,
    max_output_tokens: int,
    system_tokens: int = 0,
    retrieval_tokens: int = 0,
    prompt_tokens: int = 0,
    floor: int = 512,
    safety_margin_tokens: int = DEFAULT_SAFETY_MARGIN_TOKENS,
) -> int:
    """How many tokens of history fit once everything else is reserved.

    Clamped to ``floor`` so a very small context window still leaves *some*
    room for history rather than reasoning itself to zero and dropping every
    prior turn every time.
    """
    remaining = (
        num_ctx
        - max_output_tokens
        - system_tokens
        - retrieval_tokens
        - prompt_tokens
        - safety_margin_tokens
    )
    return max(floor, remaining)


def _truncate_marker(dropped_chars: int) -> str:
    return f"\n\n… [truncated {dropped_chars} characters]"


def budget_history(
    turns: Sequence[HistoryTurn],
    *,
    budget_tokens: int,
    min_turns: int = 2,
) -> BudgetedHistory:
    """Select the most recent turns that fit ``budget_tokens``.

    ``turns`` must already be oldest-first (as read from storage). Selection
    walks newest-first so the most recent exchange is always considered first,
    then the result is returned oldest-first again for prompt assembly.

    At least ``min_turns`` are kept even when that exceeds the budget: the
    oldest of the forced-kept turns has its content truncated with an explicit
    marker rather than being dropped outright, so the model sees *something*
    of it instead of nothing.
    """
    budget_chars = max(0, budget_tokens) * CHARS_PER_TOKEN

    kept: list[HistoryTurn] = []
    used_chars = 0
    dropped = 0
    truncated_chars = 0

    for turn in reversed(turns):
        turn_chars = len(turn.content)
        within_budget = used_chars + turn_chars <= budget_chars
        must_keep = len(kept) < min_turns

        if within_budget or must_keep:
            kept.append(turn)
            used_chars += turn_chars
            continue

        dropped += 1

    # A forced-kept turn may still have pushed used_chars over budget_chars.
    # Truncate from the oldest kept turn (the last one appended) so the most
    # recent exchange is never the one that loses content.
    if used_chars > budget_chars and kept:
        oldest_kept = kept[-1]
        overflow = used_chars - budget_chars
        keep_chars = max(0, len(oldest_kept.content) - overflow)
        if keep_chars < len(oldest_kept.content):
            marker = _truncate_marker(len(oldest_kept.content) - keep_chars)
            new_content = oldest_kept.content[:keep_chars] + marker
            truncated_chars = len(oldest_kept.content) - keep_chars
            kept[-1] = HistoryTurn(
                role=oldest_kept.role,
                content=new_content,
                message_id=oldest_kept.message_id,
                ordinal=oldest_kept.ordinal,
            )
            used_chars = used_chars - overflow

    kept.reverse()
    estimated_tokens = used_chars // CHARS_PER_TOKEN

    return BudgetedHistory(
        turns=kept,
        dropped_turns=dropped,
        truncated_chars=truncated_chars,
        estimated_tokens=estimated_tokens,
        estimated_chars=used_chars,
        budget_tokens=budget_tokens,
    )
