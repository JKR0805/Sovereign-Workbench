"""Sandbox endpoints (Section M, "Tools & sandbox").

``GET /api/sandbox/status`` measures real Docker availability.
``POST /api/sandbox/execute`` delegates to :class:`~vajra.sandbox.docker.DockerSandbox`.
``POST /api/sandbox/guard`` runs the static AST guard without executing anything.
"""

from __future__ import annotations

from fastapi import APIRouter, status
from pydantic import BaseModel, Field

from vajra.core.dependencies import Context
from vajra.sandbox.guard import scan
from vajra.sandbox.models import (
    GuardFinding,
    SandboxPolicy,
    SandboxRequest,
    SandboxResult,
    SandboxStatus,
)

router = APIRouter(prefix="/api/sandbox", tags=["sandbox"])


class GuardRequest(BaseModel):
    """Submit code to the static AST guard without executing it."""

    code: str


class GuardResponse(BaseModel):
    """Whether the guard accepts or rejects the code, and why."""

    accepted: bool
    findings: list[GuardFinding] = Field(default_factory=list)


@router.get("/status", response_model=SandboxStatus)
async def sandbox_status(context: Context) -> SandboxStatus:
    """Measured Docker daemon and image availability."""
    return context.sandbox.status()


@router.get("/policy", response_model=SandboxPolicy)
async def sandbox_policy(context: Context) -> SandboxPolicy:
    """The isolation policy as configured. Shown on the Tools page."""
    return context.sandbox.policy


@router.post("/execute", response_model=SandboxResult, status_code=status.HTTP_200_OK)
async def execute_code(request: SandboxRequest, context: Context) -> SandboxResult:
    """Execute code in the isolated sandbox container.

    Currently raises 501: the full isolation policy must be applied correctly
    before any code is run.  The static guard runs first regardless.
    """
    return await context.sandbox.execute(request)


@router.post("/guard", response_model=GuardResponse, status_code=status.HTTP_200_OK)
async def test_guard(request: GuardRequest) -> GuardResponse:
    """Run the static AST guard without executing the code.

    Useful for showing the guard's rejection of ``import requests`` on screen
    during the demo.
    """
    findings = scan(request.code)
    return GuardResponse(accepted=len(findings) == 0, findings=findings)
