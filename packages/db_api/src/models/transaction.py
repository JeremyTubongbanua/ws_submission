from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from .enums import ActionType, ActorType, PipelineState
from .types import JsonObject, UUID


@dataclass(slots=True, kw_only=True)
class Transaction:
    id: int
    content_id: UUID
    action: ActionType
    from_state: PipelineState | None = None
    to_state: PipelineState | None = None
    actor: ActorType
    actor_user_id: UUID | None = None
    actor_label: str | None = None
    details: JsonObject = field(default_factory=dict)
    created_at: datetime | None = None

    def __post_init__(self) -> None:
        if self.action == ActionType.STATE_MOVED:
            if self.from_state is None or self.to_state is None:
                raise ValueError("state_moved transactions require from_state and to_state")
