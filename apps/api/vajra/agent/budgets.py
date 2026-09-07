"""Budget enforcement (Section H, "Hard budgets, enforced and displayed").

Implemented for real: this is small, entirely deterministic, and an agent that
silently exceeds its budget is worse than one that stops. Implementation rule 7
requires the budget to be visible, so :meth:`BudgetTracker.snapshot` is what the
run header renders.
"""

from __future__ import annotations

import time

from vajra.agent.models import BudgetUsage, RunBudget
from vajra.core.exceptions import BudgetExceeded


class BudgetTracker:
    """Counts consumption and refuses to let a run exceed it."""

    def __init__(self, budget: RunBudget, *, clock: object | None = None) -> None:
        self._budget = budget
        self._monotonic = getattr(clock, "monotonic", time.monotonic)
        self._started = self._monotonic()
        self._steps = 0
        self._tool_calls = 0
        self._repairs = 0

    @property
    def budget(self) -> RunBudget:
        return self._budget

    @property
    def elapsed_s(self) -> float:
        return self._monotonic() - self._started

    def snapshot(self) -> BudgetUsage:
        return BudgetUsage(
            steps=self._steps,
            tool_calls=self._tool_calls,
            repairs=self._repairs,
            elapsed_s=self.elapsed_s,
        )

    # --- checks ----------------------------------------------------------

    def check_wall_clock(self) -> None:
        elapsed = self.elapsed_s
        if elapsed > self._budget.max_wall_clock_s:
            raise BudgetExceeded(
                f"Wall clock budget exhausted after {elapsed:.1f}s",
                budget="max_wall_clock_s",
                limit=self._budget.max_wall_clock_s,
                used=elapsed,
            )

    def consume_step(self) -> None:
        self.check_wall_clock()
        if self._steps >= self._budget.max_steps:
            raise BudgetExceeded(
                f"Step budget exhausted at {self._steps} steps",
                budget="max_steps",
                limit=self._budget.max_steps,
                used=self._steps,
            )
        self._steps += 1

    def consume_tool_call(self) -> None:
        self.check_wall_clock()
        if self._tool_calls >= self._budget.max_tool_calls:
            raise BudgetExceeded(
                f"Tool call budget exhausted at {self._tool_calls} calls",
                budget="max_tool_calls",
                limit=self._budget.max_tool_calls,
                used=self._tool_calls,
            )
        self._tool_calls += 1

    def consume_repair(self) -> None:
        self.check_wall_clock()
        if self._repairs >= self._budget.max_repairs:
            raise BudgetExceeded(
                f"Repair budget exhausted at {self._repairs} repairs",
                budget="max_repairs",
                limit=self._budget.max_repairs,
                used=self._repairs,
            )
        self._repairs += 1

    def remaining_wall_clock_s(self) -> float:
        return max(0.0, self._budget.max_wall_clock_s - self.elapsed_s)
