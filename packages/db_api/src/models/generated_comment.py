from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal

from .enums import ActorType
from .types import JsonObject, UUID


@dataclass(slots=True, kw_only=True)
class GeneratedComment:
    id: UUID
    content_id: UUID
    draft_text: str
    model_name: str
    model_temperature: Decimal | None = None
    prompt_version: str | None = None
    safety_flags: JsonObject = field(default_factory=dict)
    is_selected: bool = False
    generated_by_actor: ActorType = ActorType.AGENT
    generated_by_user_id: UUID | None = None
    created_at: datetime | None = None
