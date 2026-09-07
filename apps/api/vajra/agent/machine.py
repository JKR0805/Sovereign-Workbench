"""The typed state machine (Section H).

The transition table is data. :class:`AgentStateMachine` enforces it and records
the path taken; it does not decide *what* to do in a state, which is the
executor's job. Splitting it this way means the legal-transition rules are
testable without any model, tool or database.

Transitions, per the Section H diagram::

    INTAKE -> CLASSIFY -> ROUTE -> PLAN -> EXECUTE_STEP
    EXECUTE_STEP -> GENERATE | TOOL_CALL
    TOOL_CALL -> OBSERVE -> EXECUTE_STEP
    GENERATE -> VERIFY
    VERIFY -> ARTIFACT (pass) | REPAIR (fail)
    REPAIR -> EXECUTE_STEP
    ARTIFACT -> DONE

``ROUTE`` is re-entrant from ``EXECUTE_STEP`` because routing happens per step,
not once per run.
"""

from __future__ import annotations

from collections.abc import Mapping

from vajra.agent.models import AgentState
from vajra.core.exceptions import InvalidStateTransition

#: The legal transition table. Every state may move to FAILED.
TRANSITIONS: Mapping[AgentState, frozenset[AgentState]] = {
    AgentState.INTAKE: frozenset({AgentState.CLASSIFY}),
    AgentState.CLASSIFY: frozenset({AgentState.ROUTE}),
    AgentState.ROUTE: frozenset({AgentState.PLAN, AgentState.EXECUTE_STEP}),
    AgentState.PLAN: frozenset({AgentState.EXECUTE_STEP}),
    AgentState.EXECUTE_STEP: frozenset(
        {
            AgentState.ROUTE,
            AgentState.GENERATE,
            AgentState.TOOL_CALL,
            AgentState.VERIFY,
            AgentState.ARTIFACT,
        }
    ),
    AgentState.GENERATE: frozenset({AgentState.VERIFY, AgentState.EXECUTE_STEP}),
    AgentState.TOOL_CALL: frozenset({AgentState.OBSERVE}),
    AgentState.OBSERVE: frozenset({AgentState.EXECUTE_STEP, AgentState.VERIFY}),
    AgentState.VERIFY: frozenset(
        {AgentState.ARTIFACT, AgentState.REPAIR, AgentState.EXECUTE_STEP, AgentState.DONE}
    ),
    AgentState.REPAIR: frozenset({AgentState.EXECUTE_STEP, AgentState.GENERATE}),
    AgentState.ARTIFACT: frozenset({AgentState.DONE}),
    AgentState.DONE: frozenset(),
    AgentState.FAILED: frozenset(),
}

TERMINAL_STATES = frozenset({AgentState.DONE, AgentState.FAILED})


def can_transition(source: AgentState, target: AgentState) -> bool:
    """Is ``source -> target`` legal. Any state may fail."""
    if target is AgentState.FAILED:
        return source not in TERMINAL_STATES
    return target in TRANSITIONS.get(source, frozenset())


class AgentStateMachine:
    """Tracks the current state and the path taken through it."""

    def __init__(self, initial: AgentState = AgentState.INTAKE) -> None:
        self._state = initial
        self._history: list[AgentState] = [initial]

    @property
    def state(self) -> AgentState:
        return self._state

    @property
    def history(self) -> list[AgentState]:
        return list(self._history)

    @property
    def is_terminal(self) -> bool:
        return self._state in TERMINAL_STATES

    def transition(self, target: AgentState) -> AgentState:
        """Move to ``target``, or raise :class:`InvalidStateTransition`."""
        if not can_transition(self._state, target):
            raise InvalidStateTransition(
                f"Cannot move from {self._state.value} to {target.value}",
                source=self._state.value,
                target=target.value,
                allowed=sorted(state.value for state in TRANSITIONS.get(self._state, ())),
            )
        self._state = target
        self._history.append(target)
        return target

    def fail(self) -> AgentState:
        return self.transition(AgentState.FAILED)

    def visits(self, state: AgentState) -> int:
        """How many times a state has been entered. Used by loop guards."""
        return self._history.count(state)
