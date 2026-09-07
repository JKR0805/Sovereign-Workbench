"""Router aggregation.

Every API module exposes a ``router: APIRouter``. This module gathers them into
a single list so ``main.py`` includes them all with one loop. Adding a new
module is a two-line change: import it and append it.
"""

from __future__ import annotations

from fastapi import APIRouter

from vajra.api.audit import router as audit_router
from vajra.api.knowledge import router as knowledge_router
from vajra.api.models import router as models_router
from vajra.api.network import router as network_router
from vajra.api.routing import router as routing_router
from vajra.api.runs import router as runs_router
from vajra.api.runtimes import router as runtimes_router
from vajra.api.sandbox import router as sandbox_router
from vajra.api.system import router as system_router
from vajra.api.tools import router as tools_router

all_routers: list[APIRouter] = [
    system_router,
    runs_router,
    models_router,
    runtimes_router,
    routing_router,
    knowledge_router,
    tools_router,
    sandbox_router,
    network_router,
    audit_router,
]
