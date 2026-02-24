from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from .enums import PostingStatus
from .types import UUID


@dataclass(slots=True, kw_only=True)
class PostingEvent:
    id: UUID
    content_id: UUID
    generated_comment_id: UUID | None = None
    status: PostingStatus = PostingStatus.OPENED
    error_message: str | None = None
    created_by: UUID | None = None
    created_at: datetime | None = None
