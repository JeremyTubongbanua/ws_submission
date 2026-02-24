from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from .enums import ContentSource, ListType
from .types import UUID


@dataclass(slots=True, kw_only=True)
class DefinedList:
    id: UUID
    list_type: ListType
    source: ContentSource
    value: str
    is_active: bool = True
    notes: str | None = None
    created_by: UUID | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
