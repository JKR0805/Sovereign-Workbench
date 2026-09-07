"""Typed error hierarchy.

Every error carries a stable ``code`` which the API layer renders as an RFC 7807
``application/problem+json`` document and the UI maps to a friendly message
(Section M, "Conventions").

The two most important classes here are :class:`NotImplementedYet` and
:class:`InfrastructureUnavailable`. Scaffolded subsystems raise them instead of
returning a fabricated success. See ``docs/BACKEND.md`` ("No fake functionality").
"""

from __future__ import annotations

from typing import Any


class VajraError(Exception):
    """Base class for every VAJRA error."""

    code: str = "vajra_error"
    status_code: int = 500
    title: str = "Internal error"

    def __init__(self, detail: str, **context: Any) -> None:
        super().__init__(detail)
        self.detail = detail
        self.context: dict[str, Any] = context

    def to_problem(self, instance: str | None = None) -> dict[str, Any]:
        """Render as an RFC 7807 problem document."""
        problem: dict[str, Any] = {
            "type": f"https://vajra.local/problems/{self.code}",
            "title": self.title,
            "status": self.status_code,
            "detail": self.detail,
            "code": self.code,
        }
        if instance is not None:
            problem["instance"] = instance
        if self.context:
            problem["context"] = self.context
        return problem


# --- client errors -------------------------------------------------------


class ValidationError(VajraError):
    code = "validation_error"
    status_code = 422
    title = "Request failed validation"


class NotFound(VajraError):
    code = "not_found"
    status_code = 404
    title = "Resource not found"


class Conflict(VajraError):
    code = "conflict"
    status_code = 409
    title = "Conflicting state"


# --- honest-absence errors ----------------------------------------------


class NotImplementedYet(VajraError):
    """The subsystem is scaffolded but has no implementation yet.

    Raised deliberately. Never substitute a plausible-looking fake result.
    """

    code = "not_implemented"
    status_code = 501
    title = "Not implemented"


class InfrastructureUnavailable(VajraError):
    """A required external service or OS capability is not available here.

    Examples: Qdrant is not running, the Docker daemon is unreachable, nftables
    requires Linux and ``CAP_NET_ADMIN``.
    """

    code = "infrastructure_unavailable"
    status_code = 503
    title = "Infrastructure unavailable"


# --- runtime / adapter errors -------------------------------------------


class RuntimeAdapterError(VajraError):
    """Base class for every failure originating inside ``vajra.runtimes``."""

    code = "runtime_error"
    status_code = 502
    title = "Runtime error"


class RuntimeUnreachable(RuntimeAdapterError):
    code = "runtime_unreachable"
    status_code = 503
    title = "Runtime unreachable"


class AdapterCapabilityError(RuntimeAdapterError):
    """The operation is not part of this runtime's contract.

    This is a *correct* answer, not a stub: vLLM genuinely pins its model at
    process start, so ``load``/``unload`` cannot exist for it (Section E).
    """

    code = "adapter_capability_error"
    status_code = 501
    title = "Operation not supported by this runtime"


# --- subsystem errors ----------------------------------------------------


class RoutingError(VajraError):
    code = "routing_error"
    status_code = 422
    title = "Routing failed"


class NoCandidateModels(RoutingError):
    """Every registered model was eliminated by the hard filters."""

    code = "no_candidate_models"
    title = "No model satisfies the task requirements"


class BudgetExceeded(VajraError):
    code = "budget_exceeded"
    status_code = 409
    title = "Run budget exceeded"


class InvalidStateTransition(VajraError):
    code = "invalid_state_transition"
    status_code = 500
    title = "Invalid agent state transition"


class ToolError(VajraError):
    code = "tool_error"
    status_code = 500
    title = "Tool execution failed"


class ToolNotFound(ToolError):
    code = "tool_not_found"
    status_code = 404
    title = "Tool not registered"


class SandboxError(VajraError):
    code = "sandbox_error"
    status_code = 500
    title = "Sandbox execution failed"


class StaticGuardRejection(SandboxError):
    """The AST guard refused to execute the submitted code (Section J)."""

    code = "static_guard_rejection"
    status_code = 422
    title = "Code rejected by the static guard"


class ArtifactError(VajraError):
    code = "artifact_error"
    status_code = 500
    title = "Artifact generation failed"


class SovereigntyViolation(VajraError):
    """An attempt to reach a destination outside the trust boundary.

    Raised by the in-process egress guard (Section K, layer 1).
    """

    code = "sovereignty_violation"
    status_code = 403
    title = "Egress blocked by the sovereignty guard"
