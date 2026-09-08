"""Router aggregation with role-based access control.

Every API module exposes a ``router: APIRouter``. This module configures global route guards
(Admin only vs Authenticated User) and registers them with FastAPI.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, FastAPI

from vajra.api.admin import router as admin_router
from vajra.api.analytics import router as analytics_router
from vajra.api.audit import router as audit_router
from vajra.api.auth import router as auth_router
from vajra.api.conversations import router as conversations_router
from vajra.api.knowledge import router as knowledge_router
from vajra.api.models import router as models_router
from vajra.api.network import router as network_router
from vajra.api.routing import router as routing_router
from vajra.api.runs import router as runs_router
from vajra.api.runtimes import router as runtimes_router
from vajra.api.sandbox import router as sandbox_router
from vajra.api.system import router as system_router
from vajra.api.tools import router as tools_router
from vajra.core.dependencies import get_current_user, require_admin

public_routers: list[APIRouter] = [
    system_router,
    auth_router,
    runs_router,
    conversations_router,
]

user_routers: list[APIRouter] = [
    knowledge_router,
    analytics_router,
]

admin_routers: list[APIRouter] = [
    admin_router,
    models_router,
    runtimes_router,
    routing_router,
    tools_router,
    sandbox_router,
    network_router,
    audit_router,
]

all_routers: list[APIRouter] = public_routers + user_routers + admin_routers


def register_all_routers(app: FastAPI) -> None:
    """Register all API routers on the FastAPI app with their appropriate access control guards."""
    for router in public_routers:
        app.include_router(router)

    for router in user_routers:
        app.include_router(router, dependencies=[Depends(get_current_user)])

    for router in admin_routers:
        app.include_router(router, dependencies=[Depends(require_admin)])
