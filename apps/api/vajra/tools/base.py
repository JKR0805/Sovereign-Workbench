"""Tool base class and the unimplemented-tool sentinel.

Every call is schema-validated in and out and wrapped in a timeout. A tool that
has no implementation raises :class:`~vajra.core.exceptions.NotImplementedYet`;
it never returns a plausible-looking result.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from vajra.core.exceptions import NotImplementedYet
from vajra.tools.models import ToolContext, ToolSpec


class Tool(ABC):
    """A callable tool. Subclasses implement :meth:`execute` only."""

    spec: ToolSpec

    @abstractmethod
    async def execute(self, arguments: dict[str, Any], context: ToolContext) -> dict[str, Any]:
        """Run the tool. Arguments are already validated against the input schema.

        The returned mapping is validated against the output schema by the
        executor, so a tool cannot quietly return a shape it did not declare.
        """
        raise NotImplementedError


class UnimplementedTool(Tool):
    """A registered but unimplemented tool.

    Registering it is deliberate: the Tools page must show the full MVP toolset
    with its schemas and its real status. Calling it fails loudly.
    """

    def __init__(self, spec: ToolSpec, note: str | None = None) -> None:
        self.spec = spec.model_copy(update={"implemented": False})
        self._note = note

    async def execute(self, arguments: dict[str, Any], context: ToolContext) -> dict[str, Any]:
        detail = f"Tool {self.spec.name!r} is registered but not implemented."
        if self._note:
            detail = f"{detail} {self._note}"
        raise NotImplementedYet(detail, tool=self.spec.name, run_id=context.run_id)
