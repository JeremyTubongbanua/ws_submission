from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from .enums import PipelineState
from .types import UUID


@dataclass(slots=True, kw_only=True)
class ContentState:
    content_id: UUID
    state: PipelineState = PipelineState.INGESTED
    is_trashed: bool = False
    trashed_at: datetime | None = None
    trashed_reason: str | None = None
    trashed_by_user_id: UUID | None = None
    assigned_to: UUID | None = None
    priority: int = 3
    ai_confidence: Decimal | None = None
    last_transition_at: datetime | None = None
    updated_at: datetime | None = None

    def __post_init__(self) -> None:
        if not 1 <= self.priority <= 5:
            raise ValueError("priority must be between 1 and 5")
