from __future__ import annotations

from enum import Enum


class StrEnum(str, Enum):
    def __str__(self) -> str:
        return self.value


class ContentSource(StrEnum):
    REDDIT = "reddit"
    X = "x"
    YOUTUBE = "youtube"


class ListType(StrEnum):
    SUBREDDIT = "subreddit"
    KEYWORD = "keyword"
    ACCOUNT = "account"
    CHANNEL = "channel"


class PipelineState(StrEnum):
    INGESTED = "ingested"
    OPPORTUNITY_REVIEW = "opportunity_review"
    DRAFTING_QUEUE = "drafting_queue"
    APPROVAL_REVIEW = "approval_review"
    READY_TO_PUBLISH = "ready_to_publish"


class ActionType(StrEnum):
    INGESTED = "ingested"
    CLASSIFIED = "classified"
    STATE_MOVED = "state_moved"
    COMMENT_GENERATED = "comment_generated"
    COMMENT_REGENERATED = "comment_regenerated"
    APPROVED = "approved"
    REJECTED = "rejected"
    POSTED = "posted"
    TRASHED = "trashed"


class ActorType(StrEnum):
    SYSTEM = "system"
    AGENT = "agent"
    USER = "user"


class PostingStatus(StrEnum):
    OPENED = "opened"
    AUTOFILLED = "autofilled"
    SUBMITTED = "submitted"
    FAILED = "failed"
    DELETED = "deleted"
