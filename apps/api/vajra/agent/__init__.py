"""Agent engine: typed state machine, planner, tool loop, verifier.

Section H. Hand-written rather than a framework, because the event stream is the
product and the state machine is under 500 lines.
"""

from vajra.agent.budgets import BudgetTracker
from vajra.agent.machine import TRANSITIONS, AgentStateMachine, can_transition
from vajra.agent.models import (
    AgentState,
    BudgetUsage,
    Plan,
    PlanStep,
    RunBudget,
    RunResult,
    StepResult,
    VerificationResult,
)
from vajra.agent.planner import (
    TemplatePlanner,
    order_by_model_affinity,
    swap_count,
    validate_plan,
)
from vajra.agent.verifier import CitationIndexVerifier

__all__ = [
    "TRANSITIONS",
    "AgentState",
    "AgentStateMachine",
    "BudgetTracker",
    "BudgetUsage",
    "CitationIndexVerifier",
    "Plan",
    "PlanStep",
    "RunBudget",
    "RunResult",
    "StepResult",
    "TemplatePlanner",
    "VerificationResult",
    "can_transition",
    "order_by_model_affinity",
    "swap_count",
    "validate_plan",
]
