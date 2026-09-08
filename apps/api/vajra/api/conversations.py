"""Conversation endpoints with user-scoped isolation and admin oversight."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, status

from vajra.core.dependencies import Context, CurrentUser
from vajra.core.enums import UserRole
from vajra.orchestrator.models import (
    ConversationCreateRequest,
    ConversationDetail,
    ConversationListPage,
    ConversationRead,
    ConversationUpdateRequest,
    MessageRead,
)

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


@router.get("", response_model=ConversationListPage)
async def list_conversations(
    user: CurrentUser,
    context: Context,
    user_id: Annotated[str | None, Query()] = None,
    project_id: Annotated[str | None, Query()] = None,
    archived: Annotated[bool | None, Query()] = False,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ConversationListPage:
    """List conversations. Regular users only see their own; admin can view any or all."""
    target_user_id: str | None
    if user.role == UserRole.ADMIN:
        target_user_id = user_id
    else:
        target_user_id = user.id

    return await context.conversations.list(
        user_id=target_user_id,
        project_id=project_id,
        archived=archived,
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=ConversationRead, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    request: ConversationCreateRequest,
    user: CurrentUser,
    context: Context,
) -> ConversationRead:
    """Create a new conversation assigned to the authenticated user."""
    return await context.conversations.create(request, user_id=user.id)


@router.get("/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(
    conversation_id: str,
    user: CurrentUser,
    context: Context,
    limit: Annotated[int | None, Query(ge=1, le=1000)] = 200,
    before_ordinal: Annotated[int | None, Query()] = None,
) -> ConversationDetail:
    """Get conversation details with messages, guarded by ownership."""
    return await context.conversations.detail(
        conversation_id, limit=limit, before_ordinal=before_ordinal, user=user
    )


@router.get("/{conversation_id}/messages", response_model=list[MessageRead])
async def list_messages(
    conversation_id: str,
    user: CurrentUser,
    context: Context,
    limit: Annotated[int | None, Query(ge=1, le=1000)] = 200,
    before_ordinal: Annotated[int | None, Query()] = None,
) -> list[MessageRead]:
    """Get conversation messages, guarded by ownership."""
    detail = await context.conversations.detail(
        conversation_id, limit=limit, before_ordinal=before_ordinal, user=user
    )
    return detail.messages


@router.patch("/{conversation_id}", response_model=ConversationRead)
async def update_conversation(
    conversation_id: str,
    request: ConversationUpdateRequest,
    user: CurrentUser,
    context: Context,
) -> ConversationRead:
    """Update conversation metadata, guarded by ownership."""
    return await context.conversations.update(conversation_id, request, user=user)


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: str,
    user: CurrentUser,
    context: Context,
) -> None:
    """Delete a conversation thread, guarded by ownership."""
    await context.conversations.delete(conversation_id, user=user)
