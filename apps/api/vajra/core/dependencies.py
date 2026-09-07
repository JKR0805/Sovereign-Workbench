"""Application container and FastAPI dependencies.

One container, constructed at startup, holding every long-lived service. There is
no dependency-injection framework: Section U favours module boundaries and an
enforced import direction over machinery, and a container plus a handful of
``Depends`` functions is the whole of what this application needs.

The container is stored on ``app.state`` so tests can build one against a
temporary database without touching module-level globals.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Annotated, cast

from fastapi import Depends, Request

from vajra.artifacts.manager import ArtifactManager
from vajra.core.config import Settings, get_settings
from vajra.events.bus import EventBus
from vajra.events.store import SqlEventStore
from vajra.orchestrator.service import RunOrchestrator
from vajra.rag.embed import FastEmbedEmbedder
from vajra.rag.index import QdrantIndex
from vajra.rag.ingest import DocumentIngestor
from vajra.rag.parse import PyMuPDFParser
from vajra.rag.retrieve import HybridRetriever
from vajra.registry.residency import ResidencyService
from vajra.registry.runtimes import RuntimeManager
from vajra.registry.service import ModelRegistry
from vajra.router.engine import RouterEngine
from vajra.sandbox.docker import DockerSandbox
from vajra.sentinel.ledger import NetworkLedger
from vajra.sovereignty.guard import EgressGuard, get_guard, install_guard
from vajra.sovereignty.selfaudit import SelfAuditResult, run_self_audit
from vajra.store.database import Database
from vajra.tools.registry import ToolExecutor, ToolRegistry, build_default_registry

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class AppContext:
    """Every long-lived service, constructed once."""

    settings: Settings
    database: Database
    events: EventBus
    runtimes: RuntimeManager
    registry: ModelRegistry
    residency: ResidencyService
    router: RouterEngine
    orchestrator: RunOrchestrator
    tools: ToolRegistry
    tool_executor: ToolExecutor
    sandbox: DockerSandbox
    artifacts: ArtifactManager
    ledger: NetworkLedger
    guard: EgressGuard | None
    rag_index: QdrantIndex
    rag_parser: PyMuPDFParser
    rag_embedder: FastEmbedEmbedder
    rag_retriever: HybridRetriever
    rag_ingestor: DocumentIngestor
    self_audit: SelfAuditResult | None = None


def build_context(settings: Settings | None = None) -> AppContext:
    """Construct the container. Does no I/O; :func:`startup` does that."""
    settings = settings or get_settings()
    settings.ensure_directories()
    paths = settings.paths.resolved()

    database = Database(settings.database)
    events = EventBus(
        SqlEventStore(database),
        subscriber_queue_size=settings.events.subscriber_queue_size,
        ring_size=settings.events.memory_ring_size,
    )
    runtimes = RuntimeManager(database, settings)
    registry = ModelRegistry(database, runtimes, events)
    tools = build_default_registry()

    rag_index = QdrantIndex(settings.qdrant)
    rag_parser = PyMuPDFParser()
    rag_embedder = FastEmbedEmbedder(model=settings.rag.embedding_model)
    rag_retriever = HybridRetriever(
        embedder=rag_embedder,
        index=rag_index,
        settings=settings.rag,
    )
    rag_ingestor = DocumentIngestor(
        database=database,
        events=events,
        parser=rag_parser,
        embedder=rag_embedder,
        index=rag_index,
        settings=settings.rag,
    )

    assert paths.artifacts_dir is not None
    return AppContext(
        settings=settings,
        database=database,
        events=events,
        runtimes=runtimes,
        registry=registry,
        residency=ResidencyService(database, runtimes),
        router=RouterEngine(),
        orchestrator=RunOrchestrator(database=database, events=events),
        tools=tools,
        tool_executor=ToolExecutor(tools),
        sandbox=DockerSandbox(settings.sandbox),
        artifacts=ArtifactManager(
            database=database, artifacts_dir=paths.artifacts_dir, events=events
        ),
        ledger=NetworkLedger(database, events, settings),
        guard=get_guard(),
        rag_index=rag_index,
        rag_parser=rag_parser,
        rag_embedder=rag_embedder,
        rag_retriever=rag_retriever,
        rag_ingestor=rag_ingestor,
    )


async def startup(context: AppContext) -> None:
    """Initialise persistence, install the guard sink, run the self-audit."""
    await context.database.init()
    await context.runtimes.ensure_default_runtimes()

    if context.settings.model_profile:
        try:
            from vajra.registry.profiles import load_profile, sync_model_registry

            profile = load_profile(context.settings.model_profile)
            await sync_model_registry(
                context.database, profile, runtimes=context.runtimes, probe=True
            )
            logger.info("Synchronized hardware model profile: %s", profile.hardware.profile)
        except Exception as exc:
            logger.warning("Could not sync hardware model profile: %s", exc)

    if context.settings.sovereignty.egress_guard_enabled:
        guard = install_guard(context.settings.sovereignty.extra_allowed_cidrs)
        context.guard = guard
        guard.add_sink(
            cast(
                "object", context.ledger.sink(asyncio.get_running_loop())
            )  # type: ignore[arg-type]
        )

    if context.settings.sovereignty.selfaudit_enabled:
        context.self_audit = run_self_audit(context.settings)
        for assertion in context.self_audit.assertions:
            logger.info(
                "self-audit %s: %s (%s)",
                assertion.name,
                assertion.outcome.value,
                assertion.detail,
            )
        if not context.self_audit.passed and context.settings.fail_closed:
            failures = ", ".join(a.name for a in context.self_audit.failures)
            raise RuntimeError(
                f"Startup self-audit failed in airgap profile: {failures}. "
                "Fail closed (Implementation Plan, Section K)."
            )


async def shutdown(context: AppContext) -> None:
    await context.orchestrator.shutdown()
    await context.events.close()
    await context.runtimes.aclose()
    await context.database.dispose()


# --- FastAPI dependencies ------------------------------------------------


def get_context(request: Request) -> AppContext:
    context = getattr(request.app.state, "context", None)
    if context is None:  # pragma: no cover - the app always sets this on startup
        raise RuntimeError("Application context is not initialised")
    return cast(AppContext, context)


Context = Annotated[AppContext, Depends(get_context)]


def get_events(context: Context) -> EventBus:
    return context.events


def get_registry(context: Context) -> ModelRegistry:
    return context.registry


def get_runtimes(context: Context) -> RuntimeManager:
    return context.runtimes


def get_orchestrator(context: Context) -> RunOrchestrator:
    return context.orchestrator


def get_settings_dep(context: Context) -> Settings:
    return context.settings
