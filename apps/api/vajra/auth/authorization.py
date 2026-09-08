"""Authorization checks and ownership guard helpers."""

from __future__ import annotations

from vajra.core.enums import UserRole
from vajra.core.exceptions import NotFound
from vajra.store.models import UserRecord


def require_owner_or_admin(resource_user_id: str | None, user: UserRecord) -> None:
    """Ensure the current user owns the resource or is an administrator.

    Defensive default: if unauthorized, raises NotFound (404) instead of Forbidden (403),
    so that another user's resources are completely invisible and indistinguishable from
    non-existent resources.
    """
    if user.role == UserRole.ADMIN:
        return

    # If the resource has no owner, only admins can access it
    if resource_user_id is None or resource_user_id != user.id:
        raise NotFound("Resource not found")
