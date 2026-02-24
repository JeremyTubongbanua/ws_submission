from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from .enums import ContentSource
from .types import JsonObject, UUID


@dataclass(slots=True, kw_only=True)
class Content:
    id: UUID
    source: ContentSource
    source_content_id: str
    source_url: str
    source_author: str | None = None
    source_created_at: datetime | None = None
    title: str | None = None
    body_text: str | None = None
    raw_payload: JsonObject = field(default_factory=dict)
    scraped_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
