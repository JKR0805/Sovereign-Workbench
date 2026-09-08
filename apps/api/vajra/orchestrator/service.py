"""Run lifecycle.

Two execution paths:

:class:`DemoRunExecutor`
    **Test/demo execution path.** Deterministic, performs no model inference, no
    retrieval and no tool calls. It exists to prove the spine end to end:

        POST /api/runs -> create Run -> RUN_CREATED -> NODE_ENTERED
        -> NODE_COMPLETED -> RUN_COMPLETED -> persist -> GET /runs/{id}/events

    Every event it emits carries ``execution_mode: "demo"`` in its payload, and
    the run record stores the same, so nothing downstream can mistake it for an
    AI execution.

:class:`AgentRunExecutor`
    The production path: intake, classify + route through :mod:`vajra.router`,
    retrieve, generate against a local runtime, verify. Every number it reports
    is either read from a real component (the router's score, the runtime's
    measured token counts, the egress guard's counter) or explicitly marked
    unmeasured. Nothing here estimates a token count from a stream-chunk
    tally, and nothing here reports an airgap verdict that was not measured.
"""

from __future__ import annotations

import asyncio
import base64
import contextlib
import logging
import time
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Protocol

from vajra.core.config import Settings
from vajra.core.enums import Capability, ExecutionMode, MessageStatus, RunStatus, StepStatus
from vajra.core.exceptions import (
    Conflict,
    NoCandidateModels,
    NotFound,
    NotImplementedYet,
    SovereigntyViolation,
    VajraError,
)
from vajra.events.bus import EventBus
from vajra.events.types import EventType
from vajra.orchestrator.budget import (
    HistoryTurn,
    budget_history,
    history_budget_tokens,
)
from vajra.orchestrator.candidates import build_candidates, load_policies
from vajra.orchestrator.conversations import ConversationService, TurnHandle
from vajra.orchestrator.models import (
    RunAttachment,
    RunCreated,
    RunCreateRequest,
    RunListPage,
    RunRead,
    RunStepRead,
)
from vajra.rag.citations import build_citations
from vajra.rag.intake import AttachmentIntake, IntakeDisposition, IntakeResult
from vajra.rag.models import SearchRequest as RagSearchRequest
from vajra.rag.retrieve import HybridRetriever
from vajra.registry.residency import ResidencyService
from vajra.registry.runtimes import RuntimeManager
from vajra.registry.service import ModelRegistry
from vajra.router.classify import Attachment as RouterAttachment
from vajra.router.engine import RouterEngine, rejection_summary
from vajra.router.models import (
    RoutingDecision,
    TaskComplexity,
    TaskFeatures,
    TaskIntent,
    TaskSpec,
)
from vajra.router.understand import SemanticUnderstandingEngine
from vajra.runtimes.base import ChatMessage, ChatRequest
from vajra.auth.authorization import require_owner_or_admin
from vajra.sentinel.ledger import NetworkLedger
from vajra.sovereignty.guard import get_guard
from vajra.store.database import Database
from vajra.store.models import ModelRecord, RunRecord, RunStepRecord, UserRecord
from vajra.store.repositories.runs import RunRepository

logger = logging.getLogger(__name__)

#: Event types that terminate a run's stream. The SSE endpoint closes on these.
TERMINAL_EVENT_TYPES: frozenset[str] = frozenset(
    {
        EventType.RUN_COMPLETED.value,
        EventType.RUN_FAILED.value,
        EventType.RUN_CANCELLED.value,
    }
)

#: The fixed node sequence of an agent run:
#: Extract -> Understand/Enhance -> Retrieve -> Classify/Route -> Execute -> Verify
AGENT_NODES: tuple[tuple[int, str, str], ...] = (
    (0, "intake", "document_intake"),
    (1, "vision", "vision_caption"),
    (2, "retrieve", "vector_search"),
    (3, "classify", "classify"),
    (4, "execute", "llm_generate"),
    (5, "verify", "sovereignty_guard"),
)

RETRIEVAL_TOP_K_CORPUS = 3
RETRIEVAL_TOP_K_SCOPED = 6
RETRIEVAL_THRESHOLD_CORPUS = 0.58
RETRIEVAL_THRESHOLD_SCOPED = 0.35
CHARS_PER_TOKEN = 4

#: Cap on the vision preprocessing model's reply. This is a caption/analysis
#: feeding a second model, not the final answer, so it stays short.
VISION_MAX_OUTPUT_TOKENS = 1024

GROUNDED_SYSTEM_PROMPT = (
    "You are Sovereign Workbench AI, a sovereign airgapped enterprise intelligence assistant. "
    "Verified local knowledge base documents relevant to the user query were found and are "
    "provided below. Answer the user query accurately and directly using this context, citing "
    "the sources using their markers (e.g. [C1]). If the user asks something beyond this "
    "context, supplement using your general knowledge while keeping domain facts accurate.\n\n"
    "[Verified Local Knowledge Base Context]:\n{context}"
)
UNGROUNDED_SYSTEM_PROMPT = (
    "You are Sovereign Workbench AI, an advanced sovereign airgapped AI assistant running on "
    "local hardware. No matching documents were found in the local knowledge base for this "
    "query. Answer the user's question directly, accurately, and comprehensively using your "
    "general knowledge. Do not cite or reference non-existent documents."
)
STRUCTURED_CODING_SYSTEM_PROMPT = (
    "You are the Sovereign Workbench Senior Software Engineering and Coding Specialist. "
    "Your objective is to produce production-quality, robust, and clean technical solutions. "
    "Directives:\n"
    "1. Fulfill the user's requirement completely, adhering strictly to technical specifications and constraints.\n"
    "2. If tabular schema, data definitions, or error logs are provided, reference and utilize them accurately.\n"
    "3. Write production-ready, typed, and well-structured code with proper error handling.\n"
    "4. Accompany the code with concise explanations and usage examples where helpful.\n\n"
    "{context_block}"
)

#: Given to the vision-capable model during preprocessing. Asks for an
#: objective, exhaustive description rather than a direct answer, because the
#: text model that answers the user's actual query never sees the pixels --
#: only this description.
VISION_ANALYSIS_PROMPT = (
    "Describe this image thoroughly and objectively for another AI assistant that cannot see "
    "it. Transcribe all visible text verbatim, and describe objects, their spatial arrangement, "
    "any diagrams or charts and the data they show, colors, equipment tags or labels, and any "
    "numbers or measurements. Be precise and exhaustive: this description is the only "
    "information the other assistant will have about the image when it answers the question "
    "below.\n\nQuestion the description will be used to answer: {prompt}"
)

#: Wraps the vision model's output before it is handed to the text model, so
#: the provenance (which model produced it) is visible in the prompt the same
#: way retrieved chunks carry their citation markers.
IMAGE_CONTEXT_BLOCK = (
    "[Image Analysis -- produced by the vision model {model} from {count} attached image(s); "
    "the answering model was not shown the raw image]:\n{context}"
)


def _decode_attachment_base64(data: str) -> bytes:
    payload = data.split(";base64,", 1)[1] if ";base64," in data else data
    return base64.b64decode(payload)


class RunExecutor(Protocol):
    mode: ExecutionMode

    async def execute(
        self,
        run_id: str,
        prompt: str,
        *,
        attachments: Sequence[RunAttachment] = (),
        turn: TurnHandle | None = None,
        legacy_history: Sequence[dict[str, Any]] = (),
        partial_reply: list[str] | None = None,
    ) -> None: ...


class DemoRunExecutor:
    """Deterministic scaffold execution. Not an AI execution path.

    The node sequence mirrors the shape of a real run so the frontend graph
    reducer can be built against it, but each node does exactly one honest thing:
    it records that the scaffold reached that node.
    """

    mode = ExecutionMode.DEMO

    #: ``(node_id, kind)`` pairs. Named for the graph nodes of Section N.
    NODES: tuple[tuple[str, str], ...] = (
        ("intake", "intake"),
        ("classify", "classify"),
        ("execute", "execute_step"),
    )

    def __init__(self, database: Database, events: EventBus) -> None:
        self._database = database
        self._events = events

    async def execute(
        self,
        run_id: str,
        prompt: str,
        *,
        attachments: Sequence[RunAttachment] = (),
        turn: TurnHandle | None = None,
        legacy_history: Sequence[dict[str, Any]] = (),
        partial_reply: list[str] | None = None,
    ) -> None:
        await self._mark_running(run_id)
        started = time.perf_counter()

        for ordinal, (node_id, kind) in enumerate(self.NODES):
            node_started = time.perf_counter()
            await self._events.emit_event(
                EventType.NODE_ENTERED,
                run_id=run_id,
                node_id=node_id,
                kind=kind,
                ordinal=ordinal,
                execution_mode=self.mode.value,
            )
            step = RunStepRecord(
                run_id=run_id,
                ordinal=ordinal,
                node_id=node_id,
                kind=kind,
                status=StepStatus.RUNNING,
                started_at=datetime.now(UTC),
                input={"prompt": prompt} if node_id == "intake" else {},
            )
            async with self._database.session() as session:
                await RunRepository(session).add_step(step)

            duration_ms = (time.perf_counter() - node_started) * 1000
            step.status = StepStatus.COMPLETED
            step.duration_ms = duration_ms
            step.output = {
                "note": "deterministic scaffold node; no inference was performed"
            }
            async with self._database.session() as session:
                await RunRepository(session).save_step(step)

            await self._events.emit_event(
                EventType.NODE_COMPLETED,
                run_id=run_id,
                node_id=node_id,
                duration_ms=duration_ms,
                ordinal=ordinal,
                execution_mode=self.mode.value,
            )

        total_ms = (time.perf_counter() - started) * 1000
        await self._finish(run_id, total_ms)
        await self._events.emit_event(
            EventType.RUN_COMPLETED,
            run_id=run_id,
            duration_ms=total_ms,
            execution_mode=self.mode.value,
            note="demo execution path: no model inference was performed",
        )

    async def _mark_running(self, run_id: str) -> None:
        async with self._database.session() as session:
            repository = RunRepository(session)
            record = await repository.get(run_id)
            if record is not None:
                record.status = RunStatus.RUNNING
                record.started_at = datetime.now(UTC)
                await repository.save(record)

    async def _finish(self, run_id: str, duration_ms: float) -> None:
        async with self._database.session() as session:
            repository = RunRepository(session)
            record = await repository.get(run_id)
            if record is not None:
                record.status = RunStatus.COMPLETED
                record.finished_at = datetime.now(UTC)
                record.duration_ms = duration_ms
                await repository.save(record)


@dataclass(frozen=True, slots=True)
class RouteOutcome:
    spec: TaskSpec
    decision: RoutingDecision
    record: ModelRecord
    runtime_model_id: str
    runtime_id: str
    num_ctx: int
    max_output_tokens: int


class AgentRunExecutor:
    """The production path: intake, classify, route, execute, verify."""

    mode = ExecutionMode.AGENT

    def __init__(
        self,
        database: Database,
        events: EventBus,
        *,
        registry: ModelRegistry,
        runtimes: RuntimeManager,
        router: RouterEngine,
        residency: ResidencyService | None = None,
        retriever: HybridRetriever | None = None,
        intake: AttachmentIntake | None = None,
        conversations: ConversationService | None = None,
        ledger: NetworkLedger | None = None,
        settings: Settings | None = None,
    ) -> None:
        self._database = database
        self._events = events
        self._registry = registry
        self._runtimes = runtimes
        self._router = router
        self._residency = residency
        self._retriever = retriever
        self._intake = intake
        self._conversations = conversations
        self._ledger = ledger
        self._settings = settings
        self._max_attachment_bytes = (
            (settings.rag.max_attachment_mb if settings else 25) * 1024 * 1024
        )
        self._chunk_target_tokens = settings.rag.chunk_target_tokens if settings else 700
        self._fail_on_egress = bool(
            settings and settings.sovereignty.fail_run_on_egress
        )
        self._understanding = SemanticUnderstandingEngine(
            registry=self._registry, runtimes=self._runtimes
        )

    async def execute(
        self,
        run_id: str,
        prompt: str,
        *,
        attachments: Sequence[RunAttachment] = (),
        turn: TurnHandle | None = None,
        legacy_history: Sequence[dict[str, Any]] = (),
        partial_reply: list[str] | None = None,
    ) -> None:
        await self._mark_running(run_id)
        started = time.perf_counter()
        chunks_out: list[str] = partial_reply if partial_reply is not None else []

        # Node 0: intake -- resolve attachments before anything else, because
        # has_scanned_pages / page_count / extracted_chars drive the
        # deterministic VISION / LONG_CONTEXT overrides in classification.
        (
            router_attachments,
            image_b64s,
            document_ids,
            file_summaries,
            fallback_triggered,
        ) = await self._intake_step(run_id, attachments, ordinal=0)

        # Node 1: vision preprocessing -- attached images or scanned fallback pages
        # are described by a vision-capable model *before* the task is classified and routed,
        # so the model that answers the user's actual query is chosen for that query's
        # own intent (code, analysis, ...) rather than being forced onto a vision specialist.
        (
            vision_context,
            vision_consumed,
            vision_model_id,
            vision_prompt_tokens,
            vision_completion_tokens,
        ) = await self._vision_step(
            run_id, prompt, image_b64s, ordinal=1, fallback_triggered=fallback_triggered
        )

        if vision_consumed:
            classify_attachments = [
                a for a in router_attachments if not a.mime.startswith("image/")
            ]
            generate_image_b64s: list[str] = []
        else:
            classify_attachments = router_attachments
            generate_image_b64s = image_b64s

        if vision_context:
            file_summaries.append(f"[Visual Extraction Context]:\n{vision_context}")

        extracted_file_context = "\n\n".join(file_summaries) if file_summaries else None

        # History source: server-stored conversation turns take precedence
        # over anything the client supplied. `history` is deprecated and
        # honoured only when no conversation_id was given.
        history_turns, history_source = await self._resolve_history(
            turn, legacy_history, run_id=run_id
        )

        # A conservative context estimate for budgeting history *before* a
        # model is chosen: the budget depends on num_ctx, which depends on the
        # model, which depends on classification, which depends on the
        # history size. Any headroom the eventually-chosen model has beyond
        # this conservative estimate simply goes unused this turn.
        pre_candidates, _ = await build_candidates(
            registry=self._registry, runtimes=self._runtimes, residency=self._residency
        )
        conservative_ctx = min(
            (c.usable_context for c in pre_candidates if c.usable_context > 0), default=4096
        )
        retrieval_reserve = 0
        if self._retriever is not None:
            top_k = RETRIEVAL_TOP_K_SCOPED if document_ids else RETRIEVAL_TOP_K_CORPUS
            retrieval_reserve = top_k * self._chunk_target_tokens
        budget_tokens = history_budget_tokens(
            num_ctx=conservative_ctx,
            max_output_tokens=512,
            system_tokens=250,
            retrieval_tokens=retrieval_reserve,
            prompt_tokens=len(prompt) // CHARS_PER_TOKEN,
        )
        budgeted = budget_history(history_turns, budget_tokens=budget_tokens)

        # Stage 2: Semantic Query Understanding & Prompt Enhancement (via General Model)
        # Original prompt remains the authoritative intent, enhanced query guides retrieval
        history_summary_str = None
        if budgeted.turns:
            history_summary_str = "\n".join(
                f"{t.role}: {t.content[:150]}" for t in budgeted.turns[-2:]
            )
        understanding = await self._understanding.understand(
            prompt,
            extracted_file_context=extracted_file_context,
            history_summary=history_summary_str,
        )
        await self._events.emit_event(
            EventType.PROMPT_ENHANCED,
            run_id=run_id,
            original_prompt=prompt,
            enhanced_prompt=understanding.enhanced_prompt,
            is_coding_task=understanding.is_coding_task,
            intent=understanding.intent,
            source=understanding.understanding_source,
        )

        # Node 2: retrieve, scoped to the run's own attachments when present,
        # using the enriched query to find relevant domain and technical context
        retrieved_context, citation_dicts = await self._retrieve_step(
            run_id, understanding.enhanced_prompt, ordinal=2, document_ids=document_ids
        )

        # Node 3: classify + route -- evaluates original prompt intent + enhanced prompt + coding task flag
        route = await self._classify_and_route(
            run_id,
            prompt,
            classify_attachments,
            ordinal=3,
            history_chars=budgeted.estimated_chars,
            history_source=history_source,
            history_budget=budgeted.as_dict(),
            enhanced_prompt=understanding.enhanced_prompt,
            is_coding_task=understanding.is_coding_task,
        )
        await self._save_task_spec(run_id, route.spec)

        # Node 4: generate / execute
        (
            prompt_tokens,
            completion_tokens,
            tokens_per_sec,
        ) = await self._generate_step(
            run_id,
            prompt,
            ordinal=4,
            route=route,
            retrieved_context=retrieved_context,
            file_context=extracted_file_context,
            image_b64s=generate_image_b64s,
            vision_context=vision_context,
            vision_model_id=vision_model_id,
            vision_image_count=len(image_b64s) if vision_consumed else 0,
            history_turns=budgeted.turns,
            chunks_out=chunks_out,
        )
        reply_text = "".join(chunks_out)

        # Node 5: verify -- a real, measured, three-state verdict.
        verify_output = await self._verify_step(run_id, ordinal=5)
        if verify_output["verdict"] == "fail" and self._fail_on_egress:
            raise SovereigntyViolation(
                "Egress was detected during this run and the sovereignty policy is "
                "configured to fail the run on a dirty verdict.",
                run_id=run_id,
                **{k: v for k, v in verify_output.items() if k != "verdict"},
            )

        total_ms = (time.perf_counter() - started) * 1000
        measured_total_tokens = (
            (prompt_tokens or 0)
            + (completion_tokens or 0)
            + (vision_prompt_tokens or 0)
            + (vision_completion_tokens or 0)
        )
        models_used = [route.record.id]
        if vision_model_id and vision_model_id != route.record.id:
            models_used.append(vision_model_id)
        await self._finish(run_id, total_ms, measured_total_tokens, models_used)

        if turn is not None and self._conversations is not None:
            await self._conversations.close_turn(
                turn,
                content=reply_text,
                model_id=route.record.id,
                runtime_model_id=route.runtime_model_id,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                tokens_per_sec=tokens_per_sec,
                duration_ms=total_ms,
                citations=citation_dicts,
                status=MessageStatus.COMPLETE,
            )

        await self._events.emit_event(
            EventType.RUN_COMPLETED,
            run_id=run_id,
            duration_ms=total_ms,
            execution_mode=self.mode.value,
            total_tokens=measured_total_tokens,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            tokens_measured=bool(prompt_tokens or completion_tokens),
            tokens_per_sec=tokens_per_sec,
            models_used=models_used,
            reply=reply_text,
            citations=citation_dicts,
            verification=verify_output["verdict"],
        )

    # --- node 0: intake --------------------------------------------------

    async def _intake_step(
        self, run_id: str, attachments: Sequence[RunAttachment], *, ordinal: int
    ) -> tuple[list[RouterAttachment], list[str], list[str], list[str], bool]:
        node_started = time.perf_counter()
        node_id, kind = "intake", "document_intake"
        await self._events.emit_event(
            EventType.NODE_ENTERED,
            run_id=run_id,
            node_id=node_id,
            kind=kind,
            ordinal=ordinal,
            execution_mode=self.mode.value,
        )
        step = RunStepRecord(
            run_id=run_id,
            ordinal=ordinal,
            node_id=node_id,
            kind=kind,
            status=StepStatus.RUNNING,
            started_at=datetime.now(UTC),
            input={"attachments": len(attachments)},
        )
        async with self._database.session() as session:
            await RunRepository(session).add_step(step)

        router_attachments: list[RouterAttachment] = []
        image_b64s: list[str] = []
        document_ids: list[str] = []
        indexed: list[str] = []
        deduped: list[str] = []
        unsupported: list[dict[str, Any]] = []
        file_summaries: list[str] = []
        fallback_triggered = False
        chunk_total = 0

        if self._intake is not None:
            for attachment in attachments:
                result = await self._resolve_attachment(run_id, attachment)
                if result is None:
                    unsupported.append(
                        {
                            "filename": attachment.filename,
                            "reason": "attachment metadata only; no content was provided",
                        }
                    )
                    continue

                if result.disposition in (
                    IntakeDisposition.INDEXED,
                    IntakeDisposition.DEDUPED,
                ):
                    if result.document_id:
                        document_ids.append(result.document_id)
                    (
                        indexed if result.disposition is IntakeDisposition.INDEXED else deduped
                    ).append(result.filename)
                    chunk_total += result.chunk_count

                    if result.extracted_summary:
                        file_summaries.append(f"[{result.filename}]: {result.extracted_summary}")
                    if result.fallback_images:
                        image_b64s.extend(result.fallback_images)
                        fallback_triggered = True

                    router_attachments.append(
                        RouterAttachment(
                            filename=result.filename,
                            mime=result.mime,
                            size_bytes=result.size_bytes,
                            page_count=result.page_count,
                            scanned_page_count=result.scanned_page_count,
                            extracted_chars=self._bounded_chars(result.extracted_chars),
                            extracted_summary=result.extracted_summary,
                            requires_multimodal=result.requires_multimodal_fallback,
                        )
                    )
                    await self._events.emit_event(
                        EventType.EXTRACTION_COMPLETED,
                        run_id=run_id,
                        filename=result.filename,
                        chunk_count=result.chunk_count,
                        summary=result.extracted_summary,
                        requires_multimodal=result.requires_multimodal_fallback,
                    )
                elif result.disposition is IntakeDisposition.IMAGE:
                    if result.image_base64:
                        image_b64s.append(result.image_base64)
                    file_summaries.append(f"[Image Asset]: {result.filename}")
                    router_attachments.append(
                        RouterAttachment(
                            filename=result.filename,
                            mime=result.mime,
                            size_bytes=result.size_bytes,
                        )
                    )
                else:
                    unsupported.append({"filename": result.filename, "reason": result.detail})
                    await self._events.emit_event(
                        EventType.ATTACHMENT_SKIPPED,
                        run_id=run_id,
                        filename=result.filename,
                        mime=result.mime,
                        reason=result.detail,
                        disposition=result.disposition.value,
                    )
        elif attachments:
            for attachment in attachments:
                unsupported.append(
                    {"filename": attachment.filename, "reason": "attachment intake unavailable"}
                )

        duration_ms = (time.perf_counter() - node_started) * 1000
        step.status = StepStatus.COMPLETED
        step.duration_ms = duration_ms
        step.output = {
            "attachments": len(attachments),
            "indexed": indexed,
            "deduped": deduped,
            "images": len(image_b64s),
            "unsupported": unsupported,
            "chunk_count": chunk_total,
            "fallback_triggered": fallback_triggered,
        }
        async with self._database.session() as session:
            await RunRepository(session).save_step(step)

        await self._events.emit_event(
            EventType.NODE_COMPLETED,
            run_id=run_id,
            node_id=node_id,
            duration_ms=duration_ms,
            ordinal=ordinal,
            execution_mode=self.mode.value,
        )
        return router_attachments, image_b64s, document_ids, file_summaries, fallback_triggered

    async def _resolve_attachment(
        self, run_id: str, attachment: RunAttachment
    ) -> IntakeResult | None:
        assert self._intake is not None
        if attachment.document_id:
            return await self._intake.intake_existing(attachment.document_id, run_id=run_id)
        if attachment.data_base64:
            try:
                raw = _decode_attachment_base64(attachment.data_base64)
            except Exception:
                return IntakeResult(
                    document_id=None,
                    filename=attachment.filename,
                    mime=attachment.mime,
                    size_bytes=attachment.size_bytes,
                    sha256="",
                    storage_path=None,
                    disposition=IntakeDisposition.UNSUPPORTED,
                    detail="attachment payload is not valid base64",
                )
            if len(raw) > self._max_attachment_bytes:
                return IntakeResult(
                    document_id=None,
                    filename=attachment.filename,
                    mime=attachment.mime,
                    size_bytes=len(raw),
                    sha256="",
                    storage_path=None,
                    disposition=IntakeDisposition.UNSUPPORTED,
                    detail=(
                        f"attachment exceeds the "
                        f"{self._max_attachment_bytes // (1024 * 1024)} MB inline limit"
                    ),
                )
            return await self._intake.intake(
                raw,
                filename=attachment.filename,
                mime=attachment.mime,
                run_id=run_id,
                kind=attachment.kind,
            )
        return None

    def _bounded_chars(self, extracted_chars: int | None) -> int | None:
        """Cap the sizing estimate to what retrieval will actually inject.

        RAG sends the top-scoped retrieved chunks, not the whole document. A
        400,000-character PDF's true length would estimate to ~100,000 tokens
        and the context filter would reject every candidate; the estimate
        must reflect what will enter the prompt, which retrieval already
        bounds.
        """
        if extracted_chars is None:
            return None
        bound = RETRIEVAL_TOP_K_SCOPED * self._chunk_target_tokens * CHARS_PER_TOKEN
        return min(extracted_chars, bound)

    # --- node 1: vision preprocessing --------------------------------------

    async def _vision_step(
        self,
        run_id: str,
        prompt: str,
        image_b64s: list[str],
        *,
        ordinal: int,
        fallback_triggered: bool = False,
    ) -> tuple[str, bool, str | None, int | None, int | None]:
        """Describe attached images or multimodal fallback pages with a vision model.

        Returns ``(vision_context, consumed, vision_model_id, prompt_tokens,
        completion_tokens)``.
        """
        node_started = time.perf_counter()
        node_id, kind = "vision", "vision_caption"
        await self._events.emit_event(
            EventType.NODE_ENTERED,
            run_id=run_id,
            node_id=node_id,
            kind=kind,
            ordinal=ordinal,
            execution_mode=self.mode.value,
        )
        if fallback_triggered and image_b64s:
            await self._events.emit_event(
                EventType.MULTIMODAL_FALLBACK,
                run_id=run_id,
                image_count=len(image_b64s),
                reason="Incomplete text or scanned pages detected; multimodal extraction active.",
            )
        step = RunStepRecord(
            run_id=run_id,
            ordinal=ordinal,
            node_id=node_id,
            kind=kind,
            status=StepStatus.RUNNING,
            started_at=datetime.now(UTC),
            input={"images": len(image_b64s), "fallback_triggered": fallback_triggered},
        )
        async with self._database.session() as session:
            await RunRepository(session).add_step(step)

        vision_context = ""
        consumed = False
        vision_model_id: str | None = None
        prompt_tokens: int | None = None
        completion_tokens: int | None = None
        error: str | None = None

        if not image_b64s:
            step.status = StepStatus.COMPLETED
            step.duration_ms = (time.perf_counter() - node_started) * 1000
            step.output = {"images": 0, "note": "no image attachments"}
            async with self._database.session() as session:
                await RunRepository(session).save_step(step)
            await self._events.emit_event(
                EventType.NODE_COMPLETED,
                run_id=run_id,
                node_id=node_id,
                duration_ms=step.duration_ms,
                ordinal=ordinal,
                execution_mode=self.mode.value,
            )
            return vision_context, consumed, vision_model_id, prompt_tokens, completion_tokens

        try:
            candidates, routing_context = await build_candidates(
                registry=self._registry, runtimes=self._runtimes, residency=self._residency
            )
            vision_spec = TaskSpec(
                task_id=run_id,
                prompt=prompt,
                intent=TaskIntent.QUESTION_ANSWER,
                complexity=TaskComplexity.MEDIUM,
                required_caps=frozenset({Capability.VISION}),
                features=TaskFeatures(
                    has_image_input=True,
                    estimated_input_tokens=len(prompt) // CHARS_PER_TOKEN,
                    attachment_types=["image"] * len(image_b64s),
                ),
                classifier="vision-preprocess",
            )
            policies = await load_policies(self._database)
            decision = self._router.route(
                vision_spec, candidates, routing_context, policies=policies
            )
            record = await self._registry.get(decision.selected)
            vision_model_id = record.id

            await self._events.emit_event(
                EventType.VISION_ANALYSIS_STARTED,
                run_id=run_id,
                model_id=record.id,
                runtime_model_id=record.runtime_model_id,
                image_count=len(image_b64s),
            )

            adapter = await self._runtimes.adapter(record.runtime_id)
            request = ChatRequest(
                model=record.runtime_model_id,
                messages=[
                    ChatMessage(
                        role="user",
                        content=VISION_ANALYSIS_PROMPT.format(prompt=prompt),
                        images=image_b64s,
                    )
                ],
                stream=True,
                num_ctx=record.num_ctx or record.context_window,
                max_output_tokens=(
                    min(record.max_output_tokens, VISION_MAX_OUTPUT_TOKENS)
                    if record.max_output_tokens
                    else VISION_MAX_OUTPUT_TOKENS
                ),
            )
            description_chunks: list[str] = []
            async for chunk in adapter.chat(request):
                if chunk.delta:
                    description_chunks.append(chunk.delta)
                if chunk.prompt_tokens is not None:
                    prompt_tokens = chunk.prompt_tokens
                if chunk.completion_tokens is not None:
                    completion_tokens = chunk.completion_tokens

            vision_context = "".join(description_chunks).strip()
            consumed = bool(vision_context)

            await self._events.emit_event(
                EventType.VISION_ANALYSIS_COMPLETED,
                run_id=run_id,
                model_id=record.id,
                description_chars=len(vision_context),
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
            )
        except NoCandidateModels as exc:
            error = exc.detail
            logger.warning(
                "run %s: no vision-capable model available, falling back to raw "
                "image passthrough: %s",
                run_id,
                error,
            )
        except Exception as exc:
            error = str(exc)
            logger.warning("run %s: vision preprocessing failed: %s", run_id, error)

        duration_ms = (time.perf_counter() - node_started) * 1000
        step.status = StepStatus.COMPLETED if consumed else StepStatus.FAILED
        step.duration_ms = duration_ms
        step.output = {
            "images": len(image_b64s),
            "model_id": vision_model_id,
            "description": vision_context,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "consumed": consumed,
            "error": error,
            "fallback": None if consumed else "raw_image_passthrough",
        }
        async with self._database.session() as session:
            await RunRepository(session).save_step(step)

        if consumed:
            await self._events.emit_event(
                EventType.NODE_COMPLETED,
                run_id=run_id,
                node_id=node_id,
                duration_ms=duration_ms,
                ordinal=ordinal,
                execution_mode=self.mode.value,
            )
        else:
            await self._events.emit_event(
                EventType.NODE_FAILED,
                run_id=run_id,
                node_id=node_id,
                ordinal=ordinal,
                error=error or "vision preprocessing produced no description",
                execution_mode=self.mode.value,
            )

        return vision_context, consumed, vision_model_id, prompt_tokens, completion_tokens

    # --- history -----------------------------------------------------------

    async def _resolve_history(
        self,
        turn: TurnHandle | None,
        legacy_history: Sequence[dict[str, Any]],
        *,
        run_id: str,
    ) -> tuple[list[HistoryTurn], str]:
        if turn is not None and self._conversations is not None:
            turns = await self._conversations.history_for(
                turn.conversation_id,
                exclude_message_ids={turn.user_message_id, turn.assistant_message_id},
            )
            return turns, "server"
        if legacy_history:
            logger.warning(
                "run %s used client-supplied history (deprecated); "
                "send conversation_id instead",
                run_id,
            )
            turns = [
                HistoryTurn(
                    role=str(item.get("role", "user")),
                    content=str(item.get("content", "")),
                    message_id="",
                    ordinal=index,
                )
                for index, item in enumerate(legacy_history)
                if item.get("content")
            ]
            return turns, "client"
        return [], "none"

    # --- node 1: classify + route ------------------------------------------

    async def _classify_and_route(
        self,
        run_id: str,
        prompt: str,
        router_attachments: list[RouterAttachment],
        *,
        ordinal: int,
        history_chars: int,
        history_source: str,
        history_budget: dict[str, Any],
        enhanced_prompt: str | None = None,
        is_coding_task: bool = False,
    ) -> RouteOutcome:
        node_started = time.perf_counter()
        node_id, kind = "classify", "classify"
        await self._events.emit_event(
            EventType.NODE_ENTERED,
            run_id=run_id,
            node_id=node_id,
            kind=kind,
            ordinal=ordinal,
            execution_mode=self.mode.value,
        )
        step = RunStepRecord(
            run_id=run_id,
            ordinal=ordinal,
            node_id=node_id,
            kind=kind,
            status=StepStatus.RUNNING,
            started_at=datetime.now(UTC),
            input={
                "prompt": prompt,
                "enhanced_prompt": enhanced_prompt,
                "is_coding_task": is_coding_task,
                "attachments": [a.model_dump(mode="json") for a in router_attachments],
                "history": {**history_budget, "source": history_source},
            },
        )
        async with self._database.session() as session:
            await RunRepository(session).add_step(step)

        try:
            spec = await self._router.classify(
                run_id,
                prompt,
                router_attachments,
                extra_input_chars=history_chars,
                original_prompt=prompt,
                enhanced_prompt=enhanced_prompt,
                is_coding_task=is_coding_task,
            )
            await self._events.emit_event(
                EventType.TASK_CLASSIFIED,
                run_id=run_id,
                intent=spec.intent.value,
                complexity=spec.complexity.value,
                classifier=spec.classifier,
                domain=spec.domain,
                is_coding_task=spec.is_coding_task,
                required_capabilities=sorted(c.value for c in spec.required_caps),
                preferred_capabilities=sorted(c.value for c in spec.preferred_caps),
                estimated_input_tokens=spec.features.estimated_input_tokens,
                history={**history_budget, "source": history_source},
            )

            candidates, routing_context = await build_candidates(
                registry=self._registry, runtimes=self._runtimes, residency=self._residency
            )
            policies = await load_policies(self._database)
            decision = self._router.route(spec, candidates, routing_context, policies=policies)

            await self._events.emit_event(
                EventType.MODEL_CANDIDATES,
                run_id=run_id,
                candidates=[
                    {
                        "model_id": score.model_id,
                        "score": round(score.total, 2),
                        "resident": score.resident,
                        "policy_bonus": score.policy_bonus,
                        "terms": [
                            {
                                "name": term.name,
                                "value": round(term.value, 4),
                                "weight": term.weight,
                                "contribution": round(term.contribution, 4),
                            }
                            for term in score.terms
                        ],
                    }
                    for score in decision.candidates
                ],
                rejected=[rejection.model_dump(mode="json") for rejection in decision.rejected],
                rejection_summary=rejection_summary(decision.rejected),
                considered=len(candidates),
            )

            record = await self._registry.get(decision.selected)

            await self._events.emit_event(
                EventType.MODEL_SELECTED,
                run_id=run_id,
                model_id=record.id,
                runtime_id=record.runtime_id,
                runtime_model_id=record.runtime_model_id,
                display_name=record.display_name,
                score=round(decision.score, 2),
                rationale=decision.rationale,
                fallbacks=decision.fallbacks,
                policy_applied=decision.policy_applied,
                decided_in_ms=round(decision.decided_in_ms, 2),
                resident=record.id in routing_context.resident_model_ids,
            )

            duration_ms = (time.perf_counter() - node_started) * 1000
            step.status = StepStatus.COMPLETED
            step.duration_ms = duration_ms
            step.routing_decision = decision.model_dump(mode="json")
            step.output = {
                "selected_model": record.id,
                "runtime_model_id": record.runtime_model_id,
                "score": round(decision.score, 2),
                "rationale": decision.rationale,
                "fallbacks": decision.fallbacks,
                "policy_applied": decision.policy_applied,
                "candidates_considered": len(candidates),
                "rejected_count": len(decision.rejected),
                "history": {**history_budget, "source": history_source},
            }
            async with self._database.session() as session:
                await RunRepository(session).save_step(step)

            await self._events.emit_event(
                EventType.NODE_COMPLETED,
                run_id=run_id,
                node_id=node_id,
                duration_ms=duration_ms,
                ordinal=ordinal,
                execution_mode=self.mode.value,
            )

            return RouteOutcome(
                spec=spec,
                decision=decision,
                record=record,
                runtime_model_id=record.runtime_model_id,
                runtime_id=record.runtime_id,
                num_ctx=record.num_ctx or record.context_window,
                max_output_tokens=record.max_output_tokens,
            )
        except NoCandidateModels as exc:
            duration_ms = (time.perf_counter() - node_started) * 1000
            step.status = StepStatus.FAILED
            step.duration_ms = duration_ms
            step.output = {
                "error": exc.detail,
                "code": exc.code,
                "required_capabilities": exc.context.get("required_capabilities", []),
                "rejected": exc.context.get("rejected", []),
            }
            async with self._database.session() as session:
                await RunRepository(session).save_step(step)
            await self._events.emit_event(
                EventType.NODE_FAILED,
                run_id=run_id,
                node_id=node_id,
                ordinal=ordinal,
                error=exc.detail,
                code=exc.code,
                rejected=exc.context.get("rejected", []),
                execution_mode=self.mode.value,
            )
            raise

    async def _save_task_spec(self, run_id: str, spec: TaskSpec) -> None:
        async with self._database.session() as session:
            repository = RunRepository(session)
            record = await repository.get(run_id)
            if record is not None:
                record.task_spec = spec.model_dump(mode="json")
                await repository.save(record)

    # --- node 2: retrieve ----------------------------------------------

    async def _retrieve_step(
        self, run_id: str, prompt: str, *, ordinal: int, document_ids: list[str]
    ) -> tuple[str, list[dict[str, Any]]]:
        node_started = time.perf_counter()
        node_id, kind = "retrieve", "vector_search"
        await self._events.emit_event(
            EventType.NODE_ENTERED,
            run_id=run_id,
            node_id=node_id,
            kind=kind,
            ordinal=ordinal,
            execution_mode=self.mode.value,
        )
        scope = "attachment" if document_ids else "corpus"
        top_k = RETRIEVAL_TOP_K_SCOPED if document_ids else RETRIEVAL_TOP_K_CORPUS
        threshold = RETRIEVAL_THRESHOLD_SCOPED if document_ids else RETRIEVAL_THRESHOLD_CORPUS
        step = RunStepRecord(
            run_id=run_id,
            ordinal=ordinal,
            node_id=node_id,
            kind=kind,
            status=StepStatus.RUNNING,
            started_at=datetime.now(UTC),
            input={
                "query": prompt,
                "document_ids": document_ids,
                "top_k": top_k,
                "scope": scope,
                "similarity_threshold": threshold,
            },
        )
        async with self._database.session() as session:
            await RunRepository(session).add_step(step)

        retrieved_context = ""
        citation_dicts: list[dict[str, Any]] = []
        relevant_count = 0

        if self._retriever is not None:
            await self._events.emit_event(
                EventType.RAG_QUERY,
                run_id=run_id,
                query=prompt,
                top_k=top_k,
                document_ids=document_ids,
                scope=scope,
            )
            try:
                search_result = await self._retriever.search(
                    RagSearchRequest(query=prompt, top_k=top_k, document_ids=document_ids)
                )
                relevant_chunks = [
                    chunk for chunk in (search_result.chunks or []) if chunk.score >= threshold
                ]
                if relevant_chunks:
                    citations = build_citations(relevant_chunks)
                    context_lines: list[str] = []
                    for citation, chunk in zip(citations, relevant_chunks, strict=True):
                        context_lines.append(
                            f"{citation.marker} {citation.label} "
                            f"(score {chunk.score:.2f}):\n{chunk.text}\n"
                        )
                        citation_dicts.append(
                            {
                                "marker": citation.marker,
                                "chunk_id": chunk.chunk_id,
                                "document_id": chunk.document_id,
                                "doc_title": chunk.doc_title,
                                "section_path": chunk.section_path,
                                "page_from": chunk.page_from,
                                "page_to": chunk.page_to,
                                "score": round(chunk.score, 4),
                            }
                        )
                    retrieved_context = "\n".join(context_lines)
                    relevant_count = len(relevant_chunks)
            except Exception as exc:
                logger.warning("RAG retrieval step skipped or failed gracefully: %s", exc)

            await self._events.emit_event(
                EventType.RAG_RESULTS,
                run_id=run_id,
                query=prompt,
                chunk_count=relevant_count,
                reranked=False,
                grounded=bool(retrieved_context),
            )

        duration_ms = (time.perf_counter() - node_started) * 1000
        step.status = StepStatus.COMPLETED
        step.duration_ms = duration_ms
        step.output = {
            "chunks_found": relevant_count,
            "citations": citation_dicts,
            "grounded": bool(retrieved_context),
            "scope": scope,
            "similarity_threshold": threshold,
        }
        async with self._database.session() as session:
            await RunRepository(session).save_step(step)

        await self._events.emit_event(
            EventType.NODE_COMPLETED,
            run_id=run_id,
            node_id=node_id,
            duration_ms=duration_ms,
            ordinal=ordinal,
            execution_mode=self.mode.value,
        )
        return retrieved_context, citation_dicts

    # --- node 3: generate ----------------------------------------------

    async def _generate_step(
        self,
        run_id: str,
        prompt: str,
        *,
        ordinal: int,
        route: RouteOutcome,
        retrieved_context: str,
        image_b64s: list[str],
        vision_context: str = "",
        vision_model_id: str | None = None,
        vision_image_count: int = 0,
        history_turns: list[HistoryTurn],
        chunks_out: list[str],
        file_context: str | None = None,
    ) -> tuple[int | None, int | None, float | None]:
        node_started = time.perf_counter()
        node_id, kind = "execute", "llm_generate"
        await self._events.emit_event(
            EventType.NODE_ENTERED,
            run_id=run_id,
            node_id=node_id,
            kind=kind,
            ordinal=ordinal,
            execution_mode=self.mode.value,
        )
        step = RunStepRecord(
            run_id=run_id,
            ordinal=ordinal,
            node_id=node_id,
            kind=kind,
            status=StepStatus.RUNNING,
            started_at=datetime.now(UTC),
            input={"model": route.runtime_model_id, "prompt": prompt},
        )
        async with self._database.session() as session:
            await RunRepository(session).add_step(step)

        is_coding = bool(
            route.spec.is_coding_task or (Capability.CODING in route.spec.required_caps)
        )
        context_parts: list[str] = []
        if file_context:
            context_parts.append(f"### ATTACHED FILE CONTEXT & SCHEMAS:\n{file_context}")
        if vision_context:
            context_parts.append(
                IMAGE_CONTEXT_BLOCK.format(
                    model=vision_model_id or "unknown",
                    count=vision_image_count,
                    context=vision_context,
                )
            )
        if retrieved_context:
            context_parts.append(f"### VERIFIED RETRIEVED KNOWLEDGE (RAG):\n{retrieved_context}")

        joined_context = "\n\n".join(context_parts)
        messages: list[ChatMessage] = []

        if is_coding:
            context_block = (
                f"[Technical Context & Constraints]:\n{joined_context}"
                if joined_context
                else ""
            )
            system_msg = STRUCTURED_CODING_SYSTEM_PROMPT.format(context_block=context_block)
            messages.append(ChatMessage(role="system", content=system_msg))
        elif context_parts:
            messages.append(
                ChatMessage(
                    role="system",
                    content=GROUNDED_SYSTEM_PROMPT.format(context=joined_context),
                )
            )
        else:
            messages.append(ChatMessage(role="system", content=UNGROUNDED_SYSTEM_PROMPT))

        for turn in history_turns:
            role = turn.role if turn.role in ("system", "user", "assistant", "tool") else "user"
            messages.append(ChatMessage(role=role, content=turn.content))

        user_content = prompt
        if is_coding and route.spec.enhanced_prompt and route.spec.enhanced_prompt != prompt:
            user_content = (
                f"{prompt}\n\n"
                f"<!-- Derived Technical Target: {route.spec.enhanced_prompt} -->"
            )

        messages.append(ChatMessage(role="user", content=user_content, images=image_b64s))

        request = ChatRequest(
            model=route.runtime_model_id,
            messages=messages,
            stream=True,
            num_ctx=route.num_ctx,
            max_output_tokens=route.max_output_tokens,
        )

        adapter = await self._runtimes.adapter(route.runtime_id)
        chunk_count = 0
        prompt_tokens: int | None = None
        completion_tokens: int | None = None
        tokens_per_sec: float | None = None

        async for chunk in adapter.chat(request):
            if chunk.delta:
                chunks_out.append(chunk.delta)
                chunk_count += 1
                await self._events.emit_event(
                    EventType.LLM_TOKEN,
                    run_id=run_id,
                    token=chunk.delta,
                    model_id=route.record.id,
                )
            if chunk.prompt_tokens is not None:
                prompt_tokens = chunk.prompt_tokens
            if chunk.completion_tokens is not None:
                completion_tokens = chunk.completion_tokens
            measured_tps = chunk.tokens_per_sec
            if measured_tps is not None:
                tokens_per_sec = measured_tps

        duration_ms = (time.perf_counter() - node_started) * 1000
        step.status = StepStatus.COMPLETED
        step.duration_ms = duration_ms
        step.output = {
            "reply": "".join(chunks_out),
            "model": route.record.id,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "tokens_measured": prompt_tokens is not None or completion_tokens is not None,
            "tokens_per_sec": tokens_per_sec,
            "stream_chunks": chunk_count,
        }
        async with self._database.session() as session:
            await RunRepository(session).save_step(step)

        await self._events.emit_event(
            EventType.NODE_COMPLETED,
            run_id=run_id,
            node_id=node_id,
            duration_ms=duration_ms,
            ordinal=ordinal,
            execution_mode=self.mode.value,
        )
        return prompt_tokens, completion_tokens, tokens_per_sec

    # --- node 4: verify --------------------------------------------------

    async def _verify_step(self, run_id: str, *, ordinal: int) -> dict[str, Any]:
        node_started = time.perf_counter()
        node_id, kind = "verify", "sovereignty_guard"
        await self._events.emit_event(
            EventType.NODE_ENTERED,
            run_id=run_id,
            node_id=node_id,
            kind=kind,
            ordinal=ordinal,
            execution_mode=self.mode.value,
        )
        step = RunStepRecord(
            run_id=run_id,
            ordinal=ordinal,
            node_id=node_id,
            kind=kind,
            status=StepStatus.RUNNING,
            started_at=datetime.now(UTC),
            input={},
        )
        async with self._database.session() as session:
            await RunRepository(session).add_step(step)

        guard = get_guard()
        guard_installed = guard is not None and guard.installed

        snapshot = None
        if self._ledger is not None:
            try:
                snapshot = await self._ledger.snapshot()
            except Exception as exc:
                logger.warning("sovereignty snapshot failed: %s", exc)

        external_connections = snapshot.external_connections if snapshot else None
        nft_packets = snapshot.nft_counter.packets if snapshot else None
        app_blocked_total = (
            snapshot.app_blocked_total
            if snapshot is not None
            else (guard.blocked_count if guard else None)
        )

        if not guard_installed:
            verdict = "unverified"
        elif (app_blocked_total or 0) > 0 or (
            external_connections is not None and external_connections > 0
        ):
            verdict = "fail"
        else:
            verdict = "pass"

        output = {
            "guard_installed": guard_installed,
            "app_blocked_total": app_blocked_total,
            "external_connections": external_connections,
            "nft_counter": nft_packets,
            "verdict": verdict,
        }

        duration_ms = (time.perf_counter() - node_started) * 1000
        step.status = StepStatus.COMPLETED
        step.duration_ms = duration_ms
        step.output = output
        async with self._database.session() as session:
            await RunRepository(session).save_step(step)

        if verdict == "pass":
            await self._events.emit_event(
                EventType.VERIFICATION_PASSED,
                run_id=run_id,
                detail="Zero blocked egress attempts and zero external connections measured.",
            )
        elif verdict == "fail":
            await self._events.emit_event(
                EventType.VERIFICATION_FAILED,
                run_id=run_id,
                detail=(
                    f"{app_blocked_total or 0} blocked attempt(s) and "
                    f"{external_connections or 0} external connection(s) measured."
                ),
            )
        # "unverified": emit neither. A badge derived from an unavailable
        # sensor is worse than no badge.

        await self._events.emit_event(
            EventType.NODE_COMPLETED,
            run_id=run_id,
            node_id=node_id,
            duration_ms=duration_ms,
            ordinal=ordinal,
            execution_mode=self.mode.value,
            verdict=verdict,
        )
        return output

    # --- shared ------------------------------------------------------------

    async def _mark_running(self, run_id: str) -> None:
        async with self._database.session() as session:
            repository = RunRepository(session)
            record = await repository.get(run_id)
            if record is not None:
                record.status = RunStatus.RUNNING
                record.started_at = datetime.now(UTC)
                await repository.save(record)

    async def _finish(
        self,
        run_id: str,
        duration_ms: float,
        total_tokens: int = 0,
        models_used: list[str] | None = None,
    ) -> None:
        async with self._database.session() as session:
            repository = RunRepository(session)
            record = await repository.get(run_id)
            if record is not None:
                record.status = RunStatus.COMPLETED
                record.finished_at = datetime.now(UTC)
                record.duration_ms = duration_ms
                record.total_tokens = total_tokens
                if models_used:
                    record.models_used = models_used
                await repository.save(record)


class RunOrchestrator:
    """Creates runs, dispatches them, and reads them back."""

    def __init__(
        self,
        *,
        database: Database,
        events: EventBus,
        registry: ModelRegistry,
        runtimes: RuntimeManager,
        router: RouterEngine,
        residency: ResidencyService | None = None,
        retriever: HybridRetriever | None = None,
        intake: AttachmentIntake | None = None,
        conversations: ConversationService | None = None,
        ledger: NetworkLedger | None = None,
        settings: Settings | None = None,
        executors: dict[ExecutionMode, RunExecutor] | None = None,
    ) -> None:
        self._database = database
        self._events = events
        self._conversations = conversations
        self._executors: dict[ExecutionMode, RunExecutor] = executors or {
            ExecutionMode.DEMO: DemoRunExecutor(database, events),
            ExecutionMode.AGENT: AgentRunExecutor(
                database,
                events,
                registry=registry,
                runtimes=runtimes,
                router=router,
                residency=residency,
                retriever=retriever,
                intake=intake,
                conversations=conversations,
                ledger=ledger,
                settings=settings,
            ),
        }
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self._turns: dict[str, TurnHandle] = {}

    # --- creation --------------------------------------------------------

    async def create(
        self, request: RunCreateRequest, *, user_id: str | None = None
    ) -> RunCreated:
        """Create the run, emit ``RUN_CREATED``, and dispatch in the background.

        The event is emitted before this returns, so a client that connects to
        the SSE stream afterwards replays it from ``since=0`` and never misses
        the start of its own run.
        """
        if request.execution_mode not in self._executors:
            raise NotImplementedYet(
                f"No executor for execution mode {request.execution_mode.value!r}",
                execution_mode=request.execution_mode.value,
            )

        turn: TurnHandle | None = None
        if request.conversation_id is not None:
            if self._conversations is None:
                raise NotImplementedYet(
                    "Conversation-linked runs require the conversation service.",
                    conversation_id=request.conversation_id,
                )
            turn = await self._conversations.open_turn(
                request.conversation_id,
                prompt=request.prompt,
                attachments=[attachment.redacted() for attachment in request.attachments],
            )

        record = RunRecord(
            user_id=user_id,
            prompt=request.prompt,
            project_id=request.project_id,
            agent_id=request.agent_id,
            status=RunStatus.QUEUED,
            execution_mode=request.execution_mode.value,
            attachments=[attachment.redacted() for attachment in request.attachments],
        )
        async with self._database.session() as session:
            await RunRepository(session).create(record)

        if turn is not None and self._conversations is not None:
            await self._conversations.bind_run(turn, record.id)
            self._turns[record.id] = turn

        await self._events.emit_event(
            EventType.RUN_CREATED,
            run_id=record.id,
            prompt=request.prompt,
            execution_mode=request.execution_mode.value,
            attachments=len(request.attachments),
            conversation_id=request.conversation_id,
        )

        self._dispatch(record.id, request, turn)

        return RunCreated(
            run_id=record.id,
            status=RunStatus.QUEUED,
            execution_mode=request.execution_mode,
            events_url=f"/api/runs/{record.id}/events",
            conversation_id=turn.conversation_id if turn else None,
            user_message_id=turn.user_message_id if turn else None,
            assistant_message_id=turn.assistant_message_id if turn else None,
        )

    def _dispatch(
        self, run_id: str, request: RunCreateRequest, turn: TurnHandle | None
    ) -> None:
        executor = self._executors[request.execution_mode]
        task = asyncio.create_task(
            self._run(executor, run_id, request.prompt, request.attachments, turn, request.history)
        )
        self._tasks[run_id] = task
        task.add_done_callback(lambda _: self._tasks.pop(run_id, None))

    async def _run(
        self,
        executor: RunExecutor,
        run_id: str,
        prompt: str,
        attachments: Sequence[RunAttachment],
        turn: TurnHandle | None,
        legacy_history: Sequence[dict[str, Any]],
    ) -> None:
        partial_reply: list[str] = []
        try:
            await executor.execute(
                run_id,
                prompt,
                attachments=attachments,
                turn=turn,
                legacy_history=legacy_history,
                partial_reply=partial_reply,
            )
            # Safety net, not the normal path: AgentRunExecutor closes the
            # turn itself with real data before returning. close_turn is
            # idempotent on an already-terminal message, so this only ever
            # does something for an executor (e.g. the demo scaffold) that
            # does not know about conversations at all -- it prevents a
            # PENDING placeholder from lingering forever.
            await self._close_turn_if_any(
                turn,
                "".join(partial_reply),
                status=MessageStatus.FAILED,
                error=f"execution_mode {executor.mode.value!r} does not record conversation turns",
            )
        except asyncio.CancelledError:
            await self._mark_terminal(run_id, RunStatus.CANCELLED, "cancelled by operator")
            await self._close_turn_if_any(
                turn,
                "".join(partial_reply),
                status=MessageStatus.CANCELLED,
                error="cancelled by operator",
            )
            await self._events.emit_event(EventType.RUN_CANCELLED, run_id=run_id)
            raise
        except VajraError as exc:
            await self._mark_terminal(run_id, RunStatus.FAILED, exc.detail)
            await self._close_turn_if_any(
                turn, "".join(partial_reply), status=MessageStatus.FAILED, error=exc.detail
            )
            await self._events.emit_event(
                EventType.RUN_FAILED, run_id=run_id, error=exc.detail, code=exc.code
            )
        except Exception as exc:
            logger.exception("Run %s failed", run_id)
            await self._mark_terminal(run_id, RunStatus.FAILED, str(exc))
            await self._close_turn_if_any(
                turn, "".join(partial_reply), status=MessageStatus.FAILED, error=str(exc)
            )
            await self._events.emit_event(
                EventType.RUN_FAILED, run_id=run_id, error=str(exc), code="internal_error"
            )
        finally:
            self._turns.pop(run_id, None)

    async def _close_turn_if_any(
        self,
        turn: TurnHandle | None,
        partial_content: str,
        *,
        status: MessageStatus,
        error: str,
    ) -> None:
        """Closes the assistant placeholder on a failed or cancelled run with
        whatever text had streamed so far, so a PENDING row never lingers."""
        if turn is None or self._conversations is None:
            return
        await self._conversations.close_turn(
            turn,
            content=partial_content,
            model_id=None,
            runtime_model_id=None,
            prompt_tokens=None,
            completion_tokens=None,
            tokens_per_sec=None,
            duration_ms=None,
            citations=[],
            status=status,
            error=error,
        )

    async def _mark_terminal(self, run_id: str, status: RunStatus, error: str | None) -> None:
        async with self._database.session() as session:
            repository = RunRepository(session)
            record = await repository.get(run_id)
            if record is None:
                return
            record.status = status
            record.error = error
            record.finished_at = datetime.now(UTC)
            if record.started_at is not None:
                finished = record.finished_at
                started_at = record.started_at
                fin = finished.replace(tzinfo=None) if finished.tzinfo else finished
                st = started_at.replace(tzinfo=None) if started_at.tzinfo else started_at
                record.duration_ms = (fin - st).total_seconds() * 1000
            await repository.save(record)

    # --- reads -----------------------------------------------------------

    async def get(self, run_id: str, *, user: UserRecord | None = None) -> RunRead:
        async with self._database.session() as session:
            record = await RunRepository(session).get(run_id)
        if record is None:
            raise NotFound(f"Run {run_id!r} does not exist", run_id=run_id)
        if user is not None:
            require_owner_or_admin(record.user_id, user)
        return RunRead.from_record(record)

    async def list(
        self,
        *,
        user_id: str | None = None,
        status: RunStatus | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> RunListPage:
        async with self._database.session() as session:
            repository = RunRepository(session)
            records = await repository.list(
                user_id=user_id, status=status, limit=limit, offset=offset
            )
            total = await repository.count(user_id=user_id, status=status)
        return RunListPage(
            items=[RunRead.from_record(record) for record in records],
            total=total,
            limit=limit,
            offset=offset,
        )

    async def steps(
        self, run_id: str, *, user: UserRecord | None = None
    ) -> list[RunStepRead]:
        await self.get(run_id, user=user)
        async with self._database.session() as session:
            records = await RunRepository(session).list_steps(run_id)
        return [RunStepRead.from_record(record) for record in records]

    # --- control ---------------------------------------------------------

    async def cancel(self, run_id: str, *, user: UserRecord | None = None) -> RunRead:
        run = await self.get(run_id, user=user)
        if run.status in {RunStatus.COMPLETED, RunStatus.FAILED, RunStatus.CANCELLED}:
            raise Conflict(
                f"Run {run_id!r} is already {run.status.value}",
                run_id=run_id,
                status=run.status.value,
            )
        task = self._tasks.get(run_id)
        if task is not None:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
        else:
            await self._mark_terminal(run_id, RunStatus.CANCELLED, "cancelled by operator")
            await self._events.emit_event(EventType.RUN_CANCELLED, run_id=run_id)
        return await self.get(run_id, user=user)

    async def shutdown(self) -> None:
        for task in list(self._tasks.values()):
            task.cancel()
        for task in list(self._tasks.values()):
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await task
        self._tasks.clear()
