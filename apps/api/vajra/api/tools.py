"""Tool endpoints (Section M, "Tools & sandbox").

``GET /api/tools`` returns every registered tool with its JSON schema and honest
implementation status.  The Tools page renders this directly.

``POST /api/tools/{name}/test`` is a developer convenience for verifying schema
validation and tool behaviour outside a run.  It delegates to the ToolExecutor,
which means schema validation, timeouts and error capture apply identically.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, status
from pydantic import BaseModel, Field

from vajra.core.dependencies import Context
from vajra.tools.models import ToolContext, ToolListing, ToolResult

router = APIRouter(prefix="/api/tools", tags=["tools"])


class ToolTestRequest(BaseModel):
    """Test-execute a tool outside a run."""

    arguments: dict[str, Any] = Field(default_factory=dict)


@router.get("", response_model=list[ToolListing])
async def list_tools(context: Context) -> list[ToolListing]:
    """Registered tools with their schemas and real implementation status."""
    return context.tools.listings()


@router.get("/{tool_name}", response_model=ToolListing)
async def get_tool(tool_name: str, context: Context) -> ToolListing:
    """Schema and status for one tool."""
    tool = context.tools.get(tool_name)
    return ToolListing(
        name=tool.spec.name,
        description=tool.spec.description,
        parameters=tool.spec.parameters,
        returns=tool.spec.returns,
        side_effects=tool.spec.side_effects,
        requires_confirmation=tool.spec.requires_confirmation,
        implemented=tool.spec.implemented,
    )


@router.post("/{tool_name}/test", response_model=ToolResult, status_code=status.HTTP_200_OK)
async def test_tool(
    tool_name: str, request: ToolTestRequest, context: Context
) -> ToolResult:
    """Test-execute a tool with schema validation. Not a run; no events emitted.

    The ToolExecutor handles timeouts and error capture, so this returns a
    :class:`ToolResult` whether the call succeeded or not.
    """
    test_context = ToolContext(run_id="__test__", step_id=None)
    return await context.tool_executor.call(tool_name, request.arguments, test_context)
