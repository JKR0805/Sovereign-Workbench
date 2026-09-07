"""Tool registry, JSON-schema contracts, guarded execution.

Section H, "Tool contract". Every MVP tool is registered with a real schema;
none is implemented yet, and calling one fails explicitly.
"""

from vajra.tools.base import Tool, UnimplementedTool
from vajra.tools.models import ToolContext, ToolListing, ToolResult, ToolSpec
from vajra.tools.registry import (
    MVP_TOOL_SPECS,
    ToolExecutor,
    ToolRegistry,
    build_default_registry,
)

__all__ = [
    "MVP_TOOL_SPECS",
    "Tool",
    "ToolContext",
    "ToolExecutor",
    "ToolListing",
    "ToolRegistry",
    "ToolResult",
    "ToolSpec",
    "UnimplementedTool",
    "build_default_registry",
]
