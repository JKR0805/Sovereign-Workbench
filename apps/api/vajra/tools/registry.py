"""Tool registry and executor.

The MVP toolset of Section H is registered here with its real JSON schemas.
Registration is a *declaration of interface*, not a claim of implementation:
every entry carries ``implemented``, the Tools page renders it, and calling an
unimplemented tool raises.

Validation is real: :mod:`jsonschema` checks arguments against the declared input
schema before execution and the result against the output schema after, so a tool
cannot drift from its contract.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

from jsonschema import Draft202012Validator
from jsonschema import ValidationError as JsonSchemaValidationError

from vajra.core.enums import ToolSideEffect
from vajra.core.exceptions import ToolError, ToolNotFound, VajraError, ValidationError
from vajra.tools.base import Tool, UnimplementedTool
from vajra.tools.models import ToolContext, ToolListing, ToolResult, ToolSpec

_STRING = {"type": "string"}


def _object(properties: dict[str, Any], required: list[str]) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": properties,
        "required": required,
        "additionalProperties": False,
    }


#: The MVP toolset (Section H). Schemas are real; implementations are not yet.
MVP_TOOL_SPECS: tuple[ToolSpec, ...] = (
    ToolSpec(
        name="knowledge.search",
        description="Hybrid search over the ingested corpus, returning cited chunks.",
        parameters=_object(
            {
                "query": _STRING,
                "top_k": {"type": "integer", "minimum": 1, "maximum": 50, "default": 5},
                "document_ids": {"type": "array", "items": _STRING},
            },
            ["query"],
        ),
        returns=_object(
            {
                "chunks": {
                    "type": "array",
                    "items": _object(
                        {
                            "chunk_id": _STRING,
                            "document_id": _STRING,
                            "text": _STRING,
                            "section_path": _STRING,
                            "page_from": {"type": "integer"},
                            "score": {"type": "number"},
                        },
                        ["chunk_id", "document_id", "text", "score"],
                    ),
                }
            },
            ["chunks"],
        ),
        side_effects=ToolSideEffect.NONE,
    ),
    ToolSpec(
        name="file.read",
        description="Read a UTF-8 text file from the run workspace.",
        parameters=_object({"path": _STRING}, ["path"]),
        returns=_object({"content": _STRING, "size_bytes": {"type": "integer"}}, ["content"]),
        side_effects=ToolSideEffect.NONE,
    ),
    ToolSpec(
        name="file.write",
        description="Write a UTF-8 text file into the run workspace.",
        parameters=_object({"path": _STRING, "content": _STRING}, ["path", "content"]),
        returns=_object({"path": _STRING, "size_bytes": {"type": "integer"}}, ["path"]),
        side_effects=ToolSideEffect.FILESYSTEM,
    ),
    ToolSpec(
        name="python.execute",
        description="Execute Python in the isolated sandbox container. No network.",
        parameters=_object(
            {
                "code": _STRING,
                "files": {"type": "array", "items": _STRING},
            },
            ["code"],
        ),
        returns=_object(
            {
                "exit_code": {"type": "integer"},
                "stdout": _STRING,
                "stderr": _STRING,
                "files_created": {"type": "array", "items": _STRING},
            },
            ["exit_code", "stdout", "stderr"],
        ),
        side_effects=ToolSideEffect.COMPUTE,
        timeout_s=35.0,
    ),
    ToolSpec(
        name="spreadsheet.read",
        description="Read a CSV or XLSX file into rows with a described schema.",
        parameters=_object(
            {"path": _STRING, "sheet": _STRING, "max_rows": {"type": "integer"}}, ["path"]
        ),
        returns=_object(
            {
                "columns": {"type": "array", "items": _STRING},
                "rows": {"type": "array", "items": {"type": "array"}},
                "row_count": {"type": "integer"},
            },
            ["columns", "rows", "row_count"],
        ),
        side_effects=ToolSideEffect.NONE,
    ),
    ToolSpec(
        name="spreadsheet.write",
        description="Write rows to an XLSX artifact, optionally with a chart.",
        parameters=_object(
            {
                "filename": _STRING,
                "columns": {"type": "array", "items": _STRING},
                "rows": {"type": "array", "items": {"type": "array"}},
                "chart": _object({"kind": _STRING, "x": _STRING, "y": _STRING}, ["kind"]),
            },
            ["filename", "columns", "rows"],
        ),
        returns=_object({"artifact_id": _STRING, "path": _STRING}, ["artifact_id", "path"]),
        side_effects=ToolSideEffect.FILESYSTEM,
    ),
    ToolSpec(
        name="document.generate",
        description="Render a structured document specification as a DOCX or PDF artifact.",
        parameters=_object(
            {
                "kind": {"enum": ["docx", "pdf"]},
                "spec": {"type": "object"},
            },
            ["kind", "spec"],
        ),
        returns=_object({"artifact_id": _STRING, "path": _STRING}, ["artifact_id", "path"]),
        side_effects=ToolSideEffect.FILESYSTEM,
    ),
    ToolSpec(
        name="vision.extract",
        description="Structured extraction from a rendered page image using a vision model.",
        parameters=_object(
            {
                "document_id": _STRING,
                "pages": {"type": "array", "items": {"type": "integer"}},
                "schema": {"type": "object"},
            },
            ["document_id"],
        ),
        returns=_object(
            {
                "findings": {"type": "array", "items": {"type": "object"}},
                "illegible_regions": {"type": "array", "items": {"type": "object"}},
            },
            ["findings"],
        ),
        side_effects=ToolSideEffect.NONE,
        timeout_s=120.0,
    ),
)

#: Why each MVP tool is not yet callable. Shown in the error and on the Tools page.
_PENDING_NOTES: dict[str, str] = {
    "knowledge.search": "Blocked on the RAG subsystem (retrieval + Qdrant).",
    "file.read": "Blocked on the run workspace layout.",
    "file.write": "Blocked on the run workspace layout.",
    "python.execute": "Blocked on the Docker sandbox executor.",
    "spreadsheet.read": "Blocked on the sandbox and the openpyxl dependency.",
    "spreadsheet.write": "Blocked on the XLSX artifact renderer.",
    "document.generate": "Requires an ArtifactSpec from the agent; the DOCX renderer exists.",
    "vision.extract": "Blocked on page rendering and a routed vision generation.",
}


class ToolRegistry:
    """Name to tool. Registration order is the display order."""

    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        if tool.spec.name in self._tools:
            raise ValidationError(
                f"Tool {tool.spec.name!r} is already registered", tool=tool.spec.name
            )
        Draft202012Validator.check_schema(tool.spec.parameters)
        Draft202012Validator.check_schema(tool.spec.returns)
        self._tools[tool.spec.name] = tool

    def get(self, name: str) -> Tool:
        tool = self._tools.get(name)
        if tool is None:
            raise ToolNotFound(f"Tool {name!r} is not registered", tool=name)
        return tool

    def has(self, name: str) -> bool:
        return name in self._tools

    def specs(self) -> list[ToolSpec]:
        return [tool.spec for tool in self._tools.values()]

    def listings(self) -> list[ToolListing]:
        return [
            ToolListing(
                name=spec.name,
                description=spec.description,
                parameters=spec.parameters,
                returns=spec.returns,
                side_effects=spec.side_effects,
                requires_confirmation=spec.requires_confirmation,
                implemented=spec.implemented,
            )
            for spec in self.specs()
        ]


def build_default_registry() -> ToolRegistry:
    """Register the MVP toolset. Every entry is currently unimplemented."""
    registry = ToolRegistry()
    for spec in MVP_TOOL_SPECS:
        registry.register(UnimplementedTool(spec, _PENDING_NOTES.get(spec.name)))
    return registry


class ToolExecutor:
    """Validates, times out, executes, and validates the result."""

    def __init__(self, registry: ToolRegistry) -> None:
        self._registry = registry

    async def call(
        self, name: str, arguments: dict[str, Any], context: ToolContext
    ) -> ToolResult:
        """Execute a tool. Never raises for a tool-level failure; returns a result.

        A missing tool *does* raise: asking for a tool that does not exist is a
        programming error in the caller, not a runtime outcome.
        """
        tool = self._registry.get(name)
        started = time.perf_counter()

        try:
            self._validate(tool.spec.parameters, arguments, direction="arguments", tool=name)
            output = await asyncio.wait_for(
                tool.execute(arguments, context), timeout=tool.spec.timeout_s
            )
            self._validate(tool.spec.returns, output, direction="result", tool=name)
        except TimeoutError:
            return ToolResult(
                tool=name,
                ok=False,
                error=f"Tool {name!r} exceeded its {tool.spec.timeout_s}s timeout",
                error_code="tool_timeout",
                duration_ms=(time.perf_counter() - started) * 1000,
            )
        except VajraError as exc:
            return ToolResult(
                tool=name,
                ok=False,
                error=exc.detail,
                error_code=exc.code,
                duration_ms=(time.perf_counter() - started) * 1000,
            )
        except Exception as exc:
            return ToolResult(
                tool=name,
                ok=False,
                error=str(exc),
                error_code="tool_error",
                duration_ms=(time.perf_counter() - started) * 1000,
            )

        return ToolResult(
            tool=name,
            ok=True,
            output=output,
            duration_ms=(time.perf_counter() - started) * 1000,
        )

    @staticmethod
    def _validate(schema: dict[str, Any], payload: Any, *, direction: str, tool: str) -> None:
        try:
            Draft202012Validator(schema).validate(payload)
        except JsonSchemaValidationError as exc:
            raise ToolError(
                f"Tool {tool!r} {direction} failed schema validation: {exc.message}",
                tool=tool,
                path=list(exc.absolute_path),
            ) from exc
