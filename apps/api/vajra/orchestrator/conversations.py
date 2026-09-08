"""Conversation lifecycle: CRUD plus the three hooks the run orchestrator uses
to open, bind and close one turn of a chat.

``open_turn`` allocates both the user and assistant message ordinals and
inserts both rows in a single transaction. The ``UniqueConstraint`` on
``(conversation_id, ordinal)`` makes concurrent runs on one conversation a real
race; doing the allocation and both inserts inside one
``database.session()`` (which commits atomically) makes it safe under SQLite
WAL's single-writer model. It also hands the caller a stable
``assistant_message_id`` to stream tokens into before the run has even started.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.exc import IntegrityError

from vajra.core.enums import MessageStatus
from vajra.core.exceptions import NotFound
from vajra.events.bus import EventBus
from vajra.orchestrator.budget import HistoryTurn
from vajra.orchestrator.models import (
    ConversationCreateRequest,
    ConversationDetail,
    ConversationListPage,
    ConversationRead,
    ConversationUpdateRequest,
    MessageRead,
)
from vajra.auth.authorization import require_owner_or_admin
from vajra.store.database import Database
from vajra.store.models import ConversationRecord, MessageRecord, UserRecord
from vajra.store.repositories.conversations import ConversationRepository
from vajra.store.repositories.knowledge import KnowledgeRepository

logger = logging.getLogger(__name__)

#: Auto-generated titles are the first line of the opening prompt, collapsed
#: and capped. Long enough to be recognisable in a sidebar, short enough not to
#: wrap.
_TITLE_MAX_CHARS = 72
_WHITESPACE = re.compile(r"\s+")


def _auto_title(prompt: str) -> str:
    first_line = prompt.strip().splitlines()[0] if prompt.strip() else "New conversation"
    collapsed = _WHITESPACE.sub(" ", first_line).strip() or "New conversation"
    if len(collapsed) <= _TITLE_MAX_CHARS:
        return collapsed
    return collapsed[: _TITLE_MAX_CHARS - 1].rstrip() + "…"


@dataclass(frozen=True, slots=True)
class TurnHandle:
    conversation_id: str
    user_message_id: str
    assistant_message_id: str
    user_ordinal: int
    assistant_ordinal: int


class ConversationService:
    def __init__(self, database: Database, events: EventBus) -> None:
        self._database = database
        self._events = events

    # --- CRUD --------------------------------------------------------------

    async def create(
        self,
        request: ConversationCreateRequest,
        *,
        user_id: str | None = None,
    ) -> ConversationRead:
        record = ConversationRecord(
            user_id=user_id,
            project_id=request.project_id,
            title=request.title or "New conversation",
            title_locked=bool(request.title),
        )
        username: str | None = None
        async with self._database.session() as session:
            await ConversationRepository(session).create(record)
            if user_id:
                from vajra.store.repositories.users import UserRepository

                user = await UserRepository(session).get(user_id)
                if user:
                    username = user.username
        return ConversationRead.from_record(record, username=username)

    async def get(
        self, conversation_id: str, *, user: UserRecord | None = None
    ) -> ConversationRead:
        async with self._database.session() as session:
            item = await ConversationRepository(session).get_with_username(conversation_id)
        if item is None:
            raise NotFound(
                f"Conversation {conversation_id!r} does not exist",
                conversation_id=conversation_id,
            )
        record, username = item
        if user is not None:
            require_owner_or_admin(record.user_id, user)
        return ConversationRead.from_record(record, username=username)

    async def detail(
        self,
        conversation_id: str,
        *,
        limit: int | None = None,
        before_ordinal: int | None = None,
        user: UserRecord | None = None,
    ) -> ConversationDetail:
        async with self._database.session() as session:
            repository = ConversationRepository(session)
            item = await repository.get_with_username(conversation_id)
            if item is None:
                raise NotFound(
                    f"Conversation {conversation_id!r} does not exist",
                    conversation_id=conversation_id,
                )
            record, username = item
            if user is not None:
                require_owner_or_admin(record.user_id, user)
            fetch_limit = (limit + 1) if limit is not None else None
            messages = await repository.list_messages(
                conversation_id, limit=fetch_limit, before_ordinal=before_ordinal
            )
            knowledge_repo = KnowledgeRepository(session)
            for message in messages:
                if message.attachments:
                    enriched = []
                    for att in message.attachments:
                        if isinstance(att, dict) and not att.get("document_id") and att.get("filename"):
                            doc = await knowledge_repo.get_document_by_filename(att["filename"])
                            if doc:
                                att = dict(att)
                                att["document_id"] = doc.id
                        enriched.append(att)
                    message.attachments = enriched
        has_more = limit is not None and len(messages) > limit
        if has_more:
            messages = messages[:limit]
        base = ConversationRead.from_record(record, username=username)
        return ConversationDetail(
            **base.model_dump(),
            messages=[MessageRead.from_record(message) for message in messages],
            has_more=has_more,
        )

    async def list(
        self,
        *,
        user_id: str | None = None,
        project_id: str | None = None,
        archived: bool | None = False,
        limit: int = 50,
        offset: int = 0,
    ) -> ConversationListPage:
        async with self._database.session() as session:
            repository = ConversationRepository(session)
            records_with_user = await repository.list_with_usernames(
                user_id=user_id, project_id=project_id, archived=archived, limit=limit, offset=offset
            )
            total = await repository.count(
                user_id=user_id, project_id=project_id, archived=archived
            )
        return ConversationListPage(
            items=[
                ConversationRead.from_record(record, username=username)
                for record, username in records_with_user
            ],
            total=total,
            limit=limit,
            offset=offset,
        )

    async def update(
        self,
        conversation_id: str,
        request: ConversationUpdateRequest,
        *,
        user: UserRecord | None = None,
    ) -> ConversationRead:
        async with self._database.session() as session:
            repository = ConversationRepository(session)
            item = await repository.get_with_username(conversation_id)
            if item is None:
                raise NotFound(
                    f"Conversation {conversation_id!r} does not exist",
                    conversation_id=conversation_id,
                )
            record, username = item
            if user is not None:
                require_owner_or_admin(record.user_id, user)
            if request.title is not None:
                record.title = request.title
                record.title_locked = True
            if request.pinned is not None:
                record.pinned = request.pinned
            if request.archived is not None:
                record.archived = request.archived
            record.updated_at = datetime.now(UTC)
            await repository.save(record)
        return ConversationRead.from_record(record, username=username)

    async def delete(
        self, conversation_id: str, *, user: UserRecord | None = None
    ) -> None:
        async with self._database.session() as session:
            repository = ConversationRepository(session)
            record = await repository.get(conversation_id)
            if record is None:
                raise NotFound(
                    f"Conversation {conversation_id!r} does not exist",
                    conversation_id=conversation_id,
                )
            if user is not None:
                require_owner_or_admin(record.user_id, user)
            await repository.delete(record)

    # --- orchestrator hooks --------------------------------------------

    async def open_turn(
        self,
        conversation_id: str,
        *,
        prompt: str,
        attachments: list[dict[str, Any]],
    ) -> TurnHandle:
        """Allocate both ordinals and insert both rows in one transaction."""
        for attempt in range(2):
            try:
                async with self._database.session() as session:
                    repository = ConversationRepository(session)
                    conversation = await repository.get(conversation_id)
                    if conversation is None:
                        raise NotFound(
                            f"Conversation {conversation_id!r} does not exist",
                            conversation_id=conversation_id,
                        )

                    user_ordinal = await repository.next_ordinal(conversation_id)
                    user_message = MessageRecord(
                        conversation_id=conversation_id,
                        ordinal=user_ordinal,
                        role="user",
                        content=prompt,
                        status=MessageStatus.COMPLETE,
                        attachments=attachments,
                    )
                    await repository.add_message(user_message)

                    assistant_ordinal = user_ordinal + 1
                    assistant_message = MessageRecord(
                        conversation_id=conversation_id,
                        ordinal=assistant_ordinal,
                        role="assistant",
                        content="",
                        status=MessageStatus.PENDING,
                    )
                    await repository.add_message(assistant_message)

                    if conversation.message_count == 0 and not conversation.title_locked:
                        conversation.title = _auto_title(prompt)
                    conversation.message_count += 2
                    conversation.updated_at = datetime.now(UTC)
                    await repository.save(conversation)

                return TurnHandle(
                    conversation_id=conversation_id,
                    user_message_id=user_message.id,
                    assistant_message_id=assistant_message.id,
                    user_ordinal=user_ordinal,
                    assistant_ordinal=assistant_ordinal,
                )
            except IntegrityError:
                if attempt == 1:
                    raise
                logger.warning(
                    "ordinal collision opening turn on conversation %s; retrying",
                    conversation_id,
                )
        raise AssertionError("unreachable")  # pragma: no cover

    async def bind_run(self, handle: TurnHandle, run_id: str) -> None:
        async with self._database.session() as session:
            repository = ConversationRepository(session)
            message = await repository.get_message(handle.assistant_message_id)
            if message is not None:
                message.run_id = run_id
                message.status = MessageStatus.STREAMING
                await repository.save_message(message)

    async def close_turn(
        self,
        handle: TurnHandle,
        *,
        content: str,
        model_id: str | None,
        runtime_model_id: str | None,
        prompt_tokens: int | None,
        completion_tokens: int | None,
        tokens_per_sec: float | None,
        duration_ms: float | None,
        citations: list[dict[str, Any]],
        status: MessageStatus = MessageStatus.COMPLETE,
        error: str | None = None,
    ) -> None:
        """Idempotent: a message already in a terminal state (``COMPLETE``,
        ``FAILED``, ``CANCELLED``) is left untouched. This lets a caller close
        a turn defensively -- e.g. the orchestrator's post-execution safety
        net for an executor that never touches conversations at all -- without
        risking overwriting a turn an executor already closed with real data.
        """
        async with self._database.session() as session:
            repository = ConversationRepository(session)
            message = await repository.get_message(handle.assistant_message_id)
            if message is None:
                return
            if message.status in (
                MessageStatus.COMPLETE,
                MessageStatus.FAILED,
                MessageStatus.CANCELLED,
            ):
                return
            message.content = content
            message.status = status
            message.model_id = model_id
            message.runtime_model_id = runtime_model_id
            message.prompt_tokens = prompt_tokens
            message.completion_tokens = completion_tokens
            message.tokens_per_sec = tokens_per_sec
            message.duration_ms = duration_ms
            message.citations = citations
            message.error = error
            await repository.save_message(message)

            conversation = await repository.get(handle.conversation_id)
            if conversation is not None:
                measured_total = (prompt_tokens or 0) + (completion_tokens or 0)
                if measured_total:
                    conversation.total_tokens += measured_total
                if model_id:
                    conversation.last_model_id = model_id
                conversation.last_message_at = datetime.now(UTC)
                conversation.updated_at = datetime.now(UTC)
                await repository.save(conversation)

    async def history_for(
        self,
        conversation_id: str,
        *,
        exclude_message_ids: set[str] | frozenset[str] = frozenset(),
        max_turns: int = 40,
    ) -> list[HistoryTurn]:
        """Stored turns, oldest-first, excluding the placeholder for this run."""
        async with self._database.session() as session:
            repository = ConversationRepository(session)
            records = await repository.tail_messages(
                conversation_id, limit=max_turns + len(exclude_message_ids)
            )
        turns = [
            HistoryTurn(
                role=record.role,
                content=record.content,
                message_id=record.id,
                ordinal=record.ordinal,
            )
            for record in records
            if record.id not in exclude_message_ids
            and record.status
            in (MessageStatus.COMPLETE, MessageStatus.STREAMING, MessageStatus.FAILED)
            and record.content
        ]
        return turns[-max_turns:]
