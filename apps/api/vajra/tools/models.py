"""Tool contracts (Section H, "Tool contract")."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from vajra.core.enums import ToolSideEffect


class ToolSpec(BaseModel):
    """A tool's declared interface. JSON Schema in, JSON Schema out."""

    model_config = ConfigDict(frozen=True)

    name: str
    description: str
    parameters: dict[str, Any]
    returns: dict[str, Any]
    side_effects: ToolSideEffect = ToolSideEffect.NONE
    requires_confirmation: bool = False
    timeout_s: float = 30.0
    implemented: bool = False
    """False means calling it raises. It is never silently a no-op."""


class ToolContext(BaseModel):
    """Everything a tool is allowed to know about the run invoking it.

    Deliberately narrow. A tool receives ids and paths, never the event bus, the
    database or the Docker client. Implementation rule 9: the model never touches
    the Docker API; the API server does.
    """

    model_config = ConfigDict(frozen=True)

    run_id: str
    step_id: str | None = None
    project_id: str | None = None
    workspace_dir: str | None = None


class ToolResult(BaseModel):
    """Outcome of one tool call."""

    model_config = ConfigDict(frozen=True)

    tool: str
    ok: bool
    output: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None
    error_code: str | None = None
    duration_ms: float = 0.0


class ToolListing(BaseModel):
    """What ``GET /api/tools`` returns, including honest implementation status."""

    name: str
    description: str
    parameters: dict[str, Any]
    returns: dict[str, Any]
    side_effects: ToolSideEffect
    requires_confirmation: bool
    implemented: bool
    invocation_count: int = 0
    avg_duration_ms: float | None = None
