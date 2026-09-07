"""Run lifecycle.

Two execution paths, deliberately separate:

:class:`DemoRunExecutor`
    **Test/demo execution path.** Deterministic, performs no model inference, no
    retrieval and no tool calls. It exists to prove the spine end to end:

        POST /api/runs -> create Run -> RUN_CREATED -> NODE_ENTERED
        -> NODE_COMPLETED -> RUN_COMPLETED -> persist -> GET /runs/{id}/events

    Every event it emits carries ``execution_mode: "demo"`` in its payload, and
    the run record stores the same, so nothing downstream can mistake it for an
    AI execution.

:class:`AgentRunExecutor`
    The production path. Not implemented; it raises rather than degrading to the
    demo path, because a run that silently produced no inference would be the
    worst kind of fake success.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from datetime import UTC, datetime
from typing import Protocol

from vajra.core.enums import ExecutionMode, RunStatus, StepStatus
from vajra.core.exceptions import Conflict, NotFound, NotImplementedYet, VajraError
from vajra.events.bus import EventBus
from vajra.events.types import EventType
from vajra.orchestrator.models import (
    RunCreated,
    RunCreateRequest,
    RunListPage,
    RunRead,
    RunStepRead,
)
from vajra.store.database import Database
from vajra.store.models import RunRecord, RunStepRecord
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


class RunExecutor(Protocol):
    mode: ExecutionMode

    async def execute(self, run_id: str, prompt: str) -> None: ...


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

    async def execute(self, run_id: str, prompt: str) -> None:
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
                await RunRepository(session).add_step(step)

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


class AgentRunExecutor:
    """The production path: intake, classify, route, plan, execute, verify, artifact.

    Not implemented. It needs the agent state machine driven against a routed
    model, the RAG retriever and the tool executor, none of which can produce a
    real result yet.
    """

    mode = ExecutionMode.AGENT

    async def execute(self, run_id: str, prompt: str) -> None:
        raise NotImplementedYet(
            "Agent execution is not implemented. Use execution_mode='demo' to exercise "
            "the event and SSE path; a run that performed no inference must not be "
            "reported as a completed agent run.",
            run_id=run_id,
        )


class RunOrchestrator:
    """Creates runs, dispatches them, and reads them back."""

    def __init__(
        self,
        *,
        database: Database,
        events: EventBus,
        executors: dict[ExecutionMode, RunExecutor] | None = None,
    ) -> None:
        self._database = database
        self._events = events
        self._executors: dict[ExecutionMode, RunExecutor] = executors or {
            ExecutionMode.DEMO: DemoRunExecutor(database, events),
            ExecutionMode.AGENT: AgentRunExecutor(),
        }
        self._tasks: dict[str, asyncio.Task[None]] = {}

    # --- creation --------------------------------------------------------

    async def create(self, request: RunCreateRequest) -> RunCreated:
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

        record = RunRecord(
            prompt=request.prompt,
            project_id=request.project_id,
            agent_id=request.agent_id,
            status=RunStatus.QUEUED,
            execution_mode=request.execution_mode.value,
            attachments=[attachment.model_dump() for attachment in request.attachments],
        )
        async with self._database.session() as session:
            await RunRepository(session).create(record)

        await self._events.emit_event(
            EventType.RUN_CREATED,
            run_id=record.id,
            prompt=request.prompt,
            execution_mode=request.execution_mode.value,
            attachments=len(request.attachments),
        )

        self._dispatch(record.id, request)

        return RunCreated(
            run_id=record.id,
            status=RunStatus.QUEUED,
            execution_mode=request.execution_mode,
            events_url=f"/api/runs/{record.id}/events",
        )

    def _dispatch(self, run_id: str, request: RunCreateRequest) -> None:
        executor = self._executors[request.execution_mode]
        task = asyncio.create_task(self._run(executor, run_id, request.prompt))
        self._tasks[run_id] = task
        task.add_done_callback(lambda _: self._tasks.pop(run_id, None))

    async def _run(self, executor: RunExecutor, run_id: str, prompt: str) -> None:
        try:
            await executor.execute(run_id, prompt)
        except asyncio.CancelledError:
            await self._mark_terminal(run_id, RunStatus.CANCELLED, "cancelled by operator")
            await self._events.emit_event(EventType.RUN_CANCELLED, run_id=run_id)
            raise
        except VajraError as exc:
            await self._mark_terminal(run_id, RunStatus.FAILED, exc.detail)
            await self._events.emit_event(
                EventType.RUN_FAILED, run_id=run_id, error=exc.detail, code=exc.code
            )
        except Exception as exc:
            logger.exception("Run %s failed", run_id)
            await self._mark_terminal(run_id, RunStatus.FAILED, str(exc))
            await self._events.emit_event(
                EventType.RUN_FAILED, run_id=run_id, error=str(exc), code="internal_error"
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
                record.duration_ms = (
                    record.finished_at - record.started_at
                ).total_seconds() * 1000
            await repository.save(record)

    # --- reads -----------------------------------------------------------

    async def get(self, run_id: str) -> RunRead:
        async with self._database.session() as session:
            record = await RunRepository(session).get(run_id)
        if record is None:
            raise NotFound(f"Run {run_id!r} does not exist", run_id=run_id)
        return RunRead.from_record(record)

    async def list(
        self, *, status: RunStatus | None = None, limit: int = 50, offset: int = 0
    ) -> RunListPage:
        async with self._database.session() as session:
            repository = RunRepository(session)
            records = await repository.list(status=status, limit=limit, offset=offset)
            total = await repository.count(status=status)
        return RunListPage(
            items=[RunRead.from_record(record) for record in records],
            total=total,
            limit=limit,
            offset=offset,
        )

    async def steps(self, run_id: str) -> list[RunStepRead]:
        async with self._database.session() as session:
            records = await RunRepository(session).list_steps(run_id)
        return [RunStepRead.from_record(record) for record in records]

    # --- control ---------------------------------------------------------

    async def cancel(self, run_id: str) -> RunRead:
        run = await self.get(run_id)
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
        return await self.get(run_id)

    async def shutdown(self) -> None:
        for task in list(self._tasks.values()):
            task.cancel()
        for task in list(self._tasks.values()):
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await task
        self._tasks.clear()
