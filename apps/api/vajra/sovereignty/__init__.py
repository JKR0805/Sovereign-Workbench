"""Sovereignty: the trust boundary and its enforcement.

Section K. This package sits at the top level of the tree and is imported before
anything else, which is both a technical requirement (the socket hook must be in
place before third-party code can open a connection) and a statement of
priorities to anyone reading the repository.

It depends on the standard library and ``vajra.core`` only.
"""

from vajra.sovereignty.guard import EgressGuard, get_guard, install_guard, reset_guard
from vajra.sovereignty.policy import (
    EgressAttempt,
    EgressDecision,
    EgressPolicy,
)
from vajra.sovereignty.selfaudit import (
    AuditAssertion,
    AuditOutcome,
    SelfAuditResult,
    run_self_audit,
)

__all__ = [
    "AuditAssertion",
    "AuditOutcome",
    "EgressAttempt",
    "EgressDecision",
    "EgressGuard",
    "EgressPolicy",
    "SelfAuditResult",
    "get_guard",
    "install_guard",
    "reset_guard",
    "run_self_audit",
]
