"""Unit tests for the tool registry, tool specs, validation, and executor."""

from __future__ import annotations

from typing import Any

import pytest

from vajra.core.enums import ToolSideEffect
from vajra.core.exceptions import ToolNotFound, ValidationError
from vajra.tools.base import Tool
from vajra.tools.models import ToolContext, ToolSpec
from vajra.tools.registry import ToolExecutor, ToolRegistry, build_default_registry


class EchoTool(Tool):
    """Simple test tool that echoes an input message."""

    def __init__(self) -> None:
        self.spec = ToolSpec(
            name="test.echo",
            description="Echo a message",
            parameters={
                "type": "object",
                "properties": {"message": {"type": "string"}},
                "required": ["message"],
                "additionalProperties": False,
            },
            returns={
                "type": "object",
                "properties": {"echoed": {"type": "string"}},
                "required": ["echoed"],
                "additionalProperties": False,
            },
            side_effects=ToolSideEffect.NONE,
            implemented=True,
        )

    async def execute(self, arguments: dict[str, Any], context: ToolContext) -> dict[str, Any]:
        return {"echoed": arguments["message"]}


def test_default_registry_has_mvp_tools() -> None:
    """The default registry exposes all Section H MVP tools."""
    registry = build_default_registry()
    specs = {s.name: s for s in registry.specs()}

    expected_tools = [
        "knowledge.search",
        "file.read",
        "file.write",
        "python.execute",
        "spreadsheet.read",
        "spreadsheet.write",
        "document.generate",
        "vision.extract",
    ]

    for name in expected_tools:
        assert name in specs, f"Expected MVP tool '{name}' not found in registry"
        assert registry.has(name)


def test_registry_duplicate_registration_fails() -> None:
    """Registering a tool with an existing name raises ValidationError."""
    registry = ToolRegistry()
    registry.register(EchoTool())

    with pytest.raises(ValidationError):
        registry.register(EchoTool())


def test_registry_unknown_tool_raises_not_found() -> None:
    """Querying an unregistered tool raises ToolNotFound."""
    registry = ToolRegistry()
    with pytest.raises(ToolNotFound):
        registry.get("nonexistent.tool")


@pytest.mark.asyncio
async def test_tool_executor_success() -> None:
    """ToolExecutor validates inputs and returns successful ToolResult."""
    registry = ToolRegistry()
    registry.register(EchoTool())

    executor = ToolExecutor(registry)
    context = ToolContext(run_id="run-1", workspace_dir="/tmp")

    result = await executor.call("test.echo", {"message": "hello world"}, context)
    assert result.ok is True
    assert result.output == {"echoed": "hello world"}
    assert result.error is None
    assert result.duration_ms >= 0


@pytest.mark.asyncio
async def test_tool_executor_input_validation_error() -> None:
    """ToolExecutor validates parameters against schema and returns ok=False on mismatch."""
    registry = ToolRegistry()
    registry.register(EchoTool())

    executor = ToolExecutor(registry)
    context = ToolContext(run_id="run-1", workspace_dir="/tmp")

    # Missing required 'message' property
    result = await executor.call("test.echo", {"wrong_key": 123}, context)
    assert result.ok is False
    assert "schema validation" in (result.error or "")


@pytest.mark.asyncio
async def test_tool_executor_unimplemented_tool() -> None:
    """Calling an unimplemented tool returns ToolResult with ok=False and descriptive error."""
    registry = build_default_registry()
    executor = ToolExecutor(registry)
    context = ToolContext(run_id="run-1", workspace_dir="/tmp")

    result = await executor.call("file.read", {"path": "test.txt"}, context)
    assert result.ok is False
    assert result.error is not None
