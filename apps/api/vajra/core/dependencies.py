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
from vajra.auth.service import AuthService
from vajra.auth.sessions import SessionService
from vajra.core.config import Settings, get_settings
from vajra.core.enums import UserRole
from vajra.core.exceptions import Forbidden, Unauthorized
from vajra.events.bus import EventBus
from vajra.events.store import SqlEventStore
from vajra.orchestrator.conversations import ConversationService
from vajra.orchestrator.service import RunOrchestrator
from vajra.rag.embed import FastEmbedEmbedder
from vajra.rag.index import QdrantIndex
from vajra.rag.ingest import DocumentIngestor
from vajra.rag.intake import AttachmentIntake
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
from vajra.store.models import UserRecord
from vajra.store.repositories.users import UserRepository
from vajra.tools.registry import ToolExecutor, ToolRegistry, build_default_registry
from sqlalchemy import text

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
    conversations: ConversationService
    attachment_intake: AttachmentIntake
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
    sessions: SessionService
    auth: AuthService
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

    sessions = SessionService(database, settings.auth)
    auth = AuthService(database, sessions, settings.auth)

    # Hoisted to locals so every consumer -- the orchestrator, the API layer's
    # /api/routing/simulate, the health check -- shares one instance rather
    # than each holding a separately constructed one that could drift.
    residency = ResidencyService(database, runtimes)
    router_engine = RouterEngine()
    ledger = NetworkLedger(database, events, settings)
    conversations = ConversationService(database, events)

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
    attachment_intake = AttachmentIntake(
        database=database, events=events, ingestor=rag_ingestor, settings=settings
    )

    assert paths.artifacts_dir is not None
    return AppContext(
        settings=settings,
        database=database,
        events=events,
        runtimes=runtimes,
        registry=registry,
        residency=residency,
        router=router_engine,
        orchestrator=RunOrchestrator(
            database=database,
            events=events,
            registry=registry,
            runtimes=runtimes,
            router=router_engine,
            residency=residency,
            retriever=rag_retriever,
            intake=attachment_intake,
            conversations=conversations,
            ledger=ledger,
            settings=settings,
        ),
        conversations=conversations,
        attachment_intake=attachment_intake,
        tools=tools,
        tool_executor=ToolExecutor(tools),
        sandbox=DockerSandbox(settings.sandbox),
        artifacts=ArtifactManager(
            database=database, artifacts_dir=paths.artifacts_dir, events=events
        ),
        ledger=ledger,
        guard=get_guard(),
        rag_index=rag_index,
        rag_parser=rag_parser,
        rag_embedder=rag_embedder,
        rag_retriever=rag_retriever,
        rag_ingestor=rag_ingestor,
        sessions=sessions,
        auth=auth,
    )


async def startup(context: AppContext) -> None:
    """Initialise persistence, install the guard sink, run the self-audit."""
    await context.database.init()
    admin_user = await context.auth.bootstrap_admin()
    try:
        async with context.database.session() as s:
            user_repo = UserRepository(s)
            admin = admin_user or await user_repo.get_by_username("admin")
            if admin:
                await s.execute(
                    text("UPDATE conversations SET user_id = :uid WHERE user_id IS NULL"),
                    {"uid": admin.id},
                )
                await s.execute(
                    text("UPDATE runs SET user_id = :uid WHERE user_id IS NULL"),
                    {"uid": admin.id},
                )
    except Exception as exc:
        logger.warning("Could not backfill legacy records with admin user_id: %s", exc)

    await context.runtimes.ensure_default_runtimes()

    # Seed default routing policy if none exists; repair any stored policy
    # whose rules predate the current RoutingPolicy schema.
    try:
        from vajra.core.exceptions import ValidationError as PolicyValidationError
        from vajra.router.policy import parse_policy
        from vajra.store.models import RoutingPolicyRecord
        from vajra.store.repositories.policies import RoutingPolicyRepository

        default_rules = [
            {
                "name": "Vision specialist policy",
                "when": {"required_caps_contains": "vision"},
            },
            {
                "name": "Coding specialist policy",
                "when": {"required_caps_contains": "coding"},
            },
        ]

        async with context.database.session() as session:
            repo = RoutingPolicyRepository(session)
            existing = await repo.list()
            if not existing:
                default_policy = RoutingPolicyRecord(
                    id="default-institutional",
                    name="Default Institutional Policy",
                    enabled=True,
                    priority=50,
                    weights={
                        "capability": 0.40,
                        "preferred": 0.15,
                        "context": 0.10,
                        "latency": 0.10,
                        "priority": 0.10,
                        "residency": 0.10,
                        "reliability": 0.05,
                    },
                    rules=default_rules,
                    graph={},
                )
                await repo.save(default_policy)
                logger.info("Seeded default institutional routing policy")
            else:
                for record in existing:
                    is_valid = True
                    for raw in record.rules or []:
                        payload = dict(raw)
                        payload.setdefault("name", record.name)
                        payload.setdefault("priority", record.priority)
                        try:
                            parse_policy(payload)
                        except PolicyValidationError:
                            is_valid = False
                            break
                    if not is_valid:
                        record.rules = default_rules
                        await repo.save(record)
                        logger.warning(
                            "Repaired routing policy %r: stored rules used a "
                            "schema older than RoutingPolicy; reset to defaults",
                            record.id,
                        )
    except Exception as exc:
        logger.warning("Could not seed/repair default routing policy: %s", exc)

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


def get_conversations(context: Context) -> ConversationService:
    return context.conversations


def get_settings_dep(context: Context) -> Settings:
    return context.settings


def get_auth(context: Context) -> AuthService:
    return context.auth


def get_sessions(context: Context) -> SessionService:
    return context.sessions


async def get_current_user(request: Request, context: Context) -> UserRecord:
    """Authenticate user from session cookie or Authorization header."""
    cookie_name = context.settings.auth.cookie_name
    token = request.cookies.get(cookie_name)
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[len("Bearer ") :].strip()

    if not token:
        raise Unauthorized("Authentication required")

    user = await context.sessions.authenticate(token)
    if not user:
        raise Unauthorized("Invalid or expired session")

    return user


CurrentUser = Annotated[UserRecord, Depends(get_current_user)]


def require_admin(user: CurrentUser) -> UserRecord:
    """Ensure the authenticated user has the ADMIN role."""
    if user.role != UserRole.ADMIN:
        raise Forbidden("Administrator privileges required")
    return user


AdminUser = Annotated[UserRecord, Depends(require_admin)]

