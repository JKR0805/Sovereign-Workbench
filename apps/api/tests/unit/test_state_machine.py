"""Unit tests for the agent state machine and budget enforcement."""

from __future__ import annotations

import pytest

from vajra.agent.budgets import BudgetTracker
from vajra.agent.machine import AgentStateMachine
from vajra.agent.models import AgentState, RunBudget
from vajra.core.exceptions import BudgetExceeded, InvalidStateTransition


def test_state_machine_legal_flow() -> None:
    """Agent state machine executes a standard legal lifecycle."""
    sm = AgentStateMachine()
    assert sm.state == AgentState.INTAKE

    sm.transition(AgentState.CLASSIFY)
    assert sm.state == AgentState.CLASSIFY

    sm.transition(AgentState.ROUTE)
    sm.transition(AgentState.PLAN)
    sm.transition(AgentState.EXECUTE_STEP)
    sm.transition(AgentState.GENERATE)
    sm.transition(AgentState.VERIFY)
    sm.transition(AgentState.ARTIFACT)
    sm.transition(AgentState.DONE)

    assert sm.state == AgentState.DONE
    assert sm.is_terminal is True
    assert sm.visits(AgentState.EXECUTE_STEP) == 1


def test_state_machine_illegal_transition_fails() -> None:
    """Illegal state transition raises InvalidStateTransition with diagnostic details."""
    sm = AgentStateMachine()
    assert sm.state == AgentState.INTAKE

    with pytest.raises(InvalidStateTransition) as exc_info:
        sm.transition(AgentState.DONE)

    assert exc_info.value.context.get("source") == AgentState.INTAKE.value
    assert exc_info.value.context.get("target") == AgentState.DONE.value


def test_state_machine_terminal_state_frozen() -> None:
    """Terminal state DONE or FAILED cannot transition to any state."""
    sm = AgentStateMachine()
    sm.fail()
    assert sm.state == AgentState.FAILED
    assert sm.is_terminal is True

    with pytest.raises(InvalidStateTransition):
        sm.transition(AgentState.INTAKE)

    with pytest.raises(InvalidStateTransition):
        sm.fail()


def test_budget_tracker_enforces_step_limit() -> None:
    """Budget tracker raises BudgetExceeded when steps exceed configured limit."""
    budget = RunBudget(max_steps=2, max_tool_calls=5, max_repairs=1, max_wall_clock_s=60.0)
    tracker = BudgetTracker(budget)

    tracker.consume_step()
    tracker.consume_step()

    with pytest.raises(BudgetExceeded) as exc_info:
        tracker.consume_step()

    assert exc_info.value.context.get("budget") == "max_steps"
    assert exc_info.value.context.get("limit") == 2


def test_budget_tracker_enforces_tool_limit() -> None:
    """Budget tracker raises BudgetExceeded when tool calls exceed limit."""
    budget = RunBudget(max_steps=10, max_tool_calls=1, max_repairs=1, max_wall_clock_s=60.0)
    tracker = BudgetTracker(budget)

    tracker.consume_tool_call()
    with pytest.raises(BudgetExceeded) as exc_info:
        tracker.consume_tool_call()

    assert exc_info.value.context.get("budget") == "max_tool_calls"
