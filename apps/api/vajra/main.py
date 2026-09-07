"""VAJRA: Sovereign On-Premise Agentic AI Workbench.

This is the FastAPI application entry point.  It wires the application context,
installs the error handler, and includes every router.

Start with::

    uvicorn vajra.main:app --reload

Or::

    python -m vajra.main

The sovereignty guard is imported *first* (Section U rule 4): it must patch
``socket.connect`` before any third-party library opens a connection at import
time.  The ``from vajra.sovereignty.guard ...`` line below looks harmless but its
position matters.
"""

from __future__ import annotations

import logging
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from vajra import __version__
from vajra.core.config import get_settings
from vajra.core.dependencies import build_context, shutdown, startup
from vajra.core.exceptions import VajraError

logger = logging.getLogger("vajra")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Startup and shutdown lifecycle.

    The context is built *before* the app yields (i.e., before serving), so by
    the time any request arrives, the database is initialised, the guard is
    installed, and the self-audit has run.
    """
    settings = get_settings()
    settings.ensure_directories()

    level = getattr(logging, settings.log_level.value, logging.INFO)
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)-8s %(name)s  %(message)s",
        datefmt="%H:%M:%S",
        stream=sys.stderr,
    )

    context = build_context(settings)
    app.state.context = context

    logger.info(
        "VAJRA %s starting | profile=%s log_level=%s",
        __version__,
        settings.profile.value,
        settings.log_level.value,
    )

    await startup(context)
    logger.info("startup complete")

    yield

    logger.info("shutting down")
    await shutdown(context)


def create_app() -> FastAPI:
    """Build the application.  Importable by tests and by ``uvicorn``."""
    settings = get_settings()

    app = FastAPI(
        title="VAJRA: Sovereign Agentic AI Workbench",
        description="On-premise control plane for a local model fleet.",
        version=__version__,
        lifespan=lifespan,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redoc_url=None,
    )

    # --- CORS (Section C: strict CSP, connect-src 'self') ----------------
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # --- RFC 7807 error handler ------------------------------------------
    @app.exception_handler(VajraError)
    async def vajra_error_handler(request: Request, exc: VajraError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=exc.to_problem(instance=str(request.url)),
            media_type="application/problem+json",
        )

    # --- routers ---------------------------------------------------------
    from vajra.api import all_routers

    for router in all_routers:
        app.include_router(router)

    return app


#: The app instance used by ``uvicorn vajra.main:app``.
app = create_app()


if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "vajra.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=True,
        log_level=settings.log_level.value.lower(),
    )
