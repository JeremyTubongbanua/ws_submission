from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal
from uuid import UUID

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from api_db import SupabaseAPIError, SupabaseClient
from api_transactions import log_transactions, tx_row
from utils.dotenv_utils import load_dotenv
from utils.supabase_reader import get_env_var, require_project_url


class IngestRequest(BaseModel):
    source: Literal["reddit", "x", "youtube"]
    source_content_id: str
    source_url: str
    source_author: str | None = None
    source_created_at: datetime | None = None
    title: str | None = None
    body_text: str | None = None
    raw_payload: dict[str, Any] = Field(default_factory=dict)
    actor: Literal["system", "agent", "user"] = "system"
    actor_label: str = "scraper-daemon"


class ClassifyRequest(BaseModel):
    decision: Literal["move_to_opportunity_review", "trash"]
    actor: Literal["system", "agent", "user"] = "agent"
    actor_label: str = "scraper-subagent"
    details: dict[str, Any] = Field(default_factory=dict)
    reason: str | None = None


class GenerateCommentRequest(BaseModel):
    draft_text: str
    model_name: str
    model_temperature: float | None = None
    prompt_version: str | None = None
    safety_flags: dict[str, Any] = Field(default_factory=dict)
    is_selected: bool = True
    actor: Literal["system", "agent", "user"] = "agent"
    actor_label: str = "comment-subagent"


class ExtensionStatusRequest(BaseModel):
    status: Literal["submitted", "deleted"]
    generated_comment_id: UUID | None = None
    error_message: str | None = None
    actor: Literal["system", "agent", "user"] = "user"
    actor_label: str = "chrome-extension"


def _load_env() -> dict[str, str]:
    db_api_dir = Path(__file__).resolve().parents[1]
    env = load_dotenv(db_api_dir / ".env")
    src_env = load_dotenv(db_api_dir / "src" / ".env")
    env.update(src_env)
    return env


ENV = _load_env()
SUPABASE_KEY = get_env_var(ENV, "SUPABASE_SECRET_API_KEY")
if not SUPABASE_KEY:
    raise RuntimeError("Missing SUPABASE_SECRET_API_KEY in db_api/.env")
PROJECT_URL = require_project_url(ENV)
SERVICE_TOKEN = get_env_var(ENV, "DB_API_SERVICE_TOKEN") or get_env_var(ENV, "API_SERVICE_TOKEN")
if not SERVICE_TOKEN:
    raise RuntimeError("Missing DB_API_SERVICE_TOKEN (or API_SERVICE_TOKEN) in db_api/.env")

client = SupabaseClient(project_url=PROJECT_URL, api_key=SUPABASE_KEY)
app = FastAPI(title="WS DB API", version="0.1.0")

VIEW_MAP: dict[str, str] = {
    "ingested": "v_ingested",
    "opportunity_review": "v_opportunity_review",
    "drafting_queue": "v_drafting_queue",
    "approval_review": "v_approval_review",
    "ready_to_publish": "v_ready_to_publish",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _to_eq(value: str) -> str:
    return f"eq.{value}"


def _to_payload(model: BaseModel) -> dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump(exclude_none=True)  # pydantic v2
    return model.dict(exclude_none=True)  # pydantic v1


def _require_auth(x_api_key: str | None = Header(default=None, alias="X-API-Key")) -> None:
    if not x_api_key or x_api_key != SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")


def _read_state_or_404(content_id: str) -> dict[str, Any]:
    state = client.get_one("content_state", filters={"content_id": _to_eq(content_id)})
    if not state:
        raise HTTPException(status_code=404, detail="content_id not found")
    return state


def _queue_response(relation: str, *, limit: int, offset: int) -> dict[str, Any]:
    items = client.list_rows(relation, limit=limit, offset=offset)
    return {"items": items, "limit": limit, "offset": offset, "count": len(items)}


@app.exception_handler(SupabaseAPIError)
def _handle_supabase_error(_: Any, exc: SupabaseAPIError) -> JSONResponse:
    detail = "Upstream database error"
    if exc.body:
        detail = f"{detail}: {exc.body}"
    return JSONResponse(status_code=502, content={"detail": detail})


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/content/ingest", dependencies=[Depends(_require_auth)])
def ingest_content(request: IngestRequest) -> dict[str, Any]:
    existing = client.get_one(
        "content",
        filters={
            "source": _to_eq(request.source),
            "source_content_id": _to_eq(request.source_content_id),
        },
    )
    if existing:
        state = _read_state_or_404(existing["id"])
        return {"created": False, "content": existing, "content_state": state}

    payload = _to_payload(request)
    payload.pop("actor", None)
    payload.pop("actor_label", None)
    content = client.insert_one("content", payload)
    content_id = content["id"]
    state = client.insert_one("content_state", {"content_id": content_id, "state": "ingested"})

    log_transactions(
        client,
        [
            tx_row(
                content_id=content_id,
                action="ingested",
                actor=request.actor,
                actor_label=request.actor_label,
                details={"source": request.source},
            )
        ],
    )
    return {"created": True, "content": content, "content_state": state}


@app.get("/v1/queues/ingested", dependencies=[Depends(_require_auth)])
def read_ingested(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    return _queue_response("v_ingested", limit=limit, offset=offset)


@app.post("/v1/queues/ingested/{content_id}/classify", dependencies=[Depends(_require_auth)])
def classify_ingested(content_id: UUID, request: ClassifyRequest) -> dict[str, Any]:
    content_id_str = str(content_id)
    current_state = _read_state_or_404(content_id_str)
    if current_state.get("is_trashed"):
        raise HTTPException(status_code=409, detail="Content is already trashed")
    if current_state.get("state") != "ingested":
        raise HTTPException(status_code=409, detail="Content is not in ingested state")

    txs = [
        tx_row(
            content_id=content_id_str,
            action="classified",
            actor=request.actor,
            actor_label=request.actor_label,
            details={"decision": request.decision, **request.details},
        )
    ]

    if request.decision == "move_to_opportunity_review":
        updated = client.update_rows(
            "content_state",
            filters={"content_id": _to_eq(content_id_str)},
            changes={"state": "opportunity_review", "last_transition_at": _now_iso()},
        )
        txs.append(
            tx_row(
                content_id=content_id_str,
                action="state_moved",
                actor=request.actor,
                actor_label=request.actor_label,
                from_state="ingested",
                to_state="opportunity_review",
                details={"via": "scraper_classification"},
            )
        )
    else:
        updated = client.update_rows(
            "content_state",
            filters={"content_id": _to_eq(content_id_str)},
            changes={
                "is_trashed": True,
                "trashed_at": _now_iso(),
                "trashed_reason": request.reason or "scraper_triage_rejected",
                "last_transition_at": _now_iso(),
            },
        )
        txs.append(
            tx_row(
                content_id=content_id_str,
                action="trashed",
                actor=request.actor,
                actor_label=request.actor_label,
                from_state="ingested",
                details={"reason": request.reason or "scraper_triage_rejected"},
            )
        )

    log_transactions(client, txs)
    return {"content_state": updated[0] if updated else None}


@app.get("/v1/queues/drafting", dependencies=[Depends(_require_auth)])
def read_drafting_queue(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    return _queue_response("v_drafting_queue", limit=limit, offset=offset)


@app.post("/v1/queues/drafting/{content_id}/generate-comment", dependencies=[Depends(_require_auth)])
def generate_comment(content_id: UUID, request: GenerateCommentRequest) -> dict[str, Any]:
    content_id_str = str(content_id)
    current_state = _read_state_or_404(content_id_str)
    if current_state.get("is_trashed"):
        raise HTTPException(status_code=409, detail="Content is already trashed")
    if current_state.get("state") != "drafting_queue":
        raise HTTPException(status_code=409, detail="Content must be in drafting_queue")

    comment = client.insert_one(
        "generated_comments",
        {
            "content_id": content_id_str,
            "draft_text": request.draft_text,
            "model_name": request.model_name,
            "model_temperature": request.model_temperature,
            "prompt_version": request.prompt_version,
            "safety_flags": request.safety_flags,
            "is_selected": request.is_selected,
            "generated_by_actor": request.actor,
        },
    )
    updated = client.update_rows(
        "content_state",
        filters={"content_id": _to_eq(content_id_str)},
        changes={"state": "approval_review", "last_transition_at": _now_iso()},
    )

    log_transactions(
        client,
        [
            tx_row(
                content_id=content_id_str,
                action="comment_generated",
                actor=request.actor,
                actor_label=request.actor_label,
                details={"model_name": request.model_name},
            ),
            tx_row(
                content_id=content_id_str,
                action="state_moved",
                actor=request.actor,
                actor_label=request.actor_label,
                from_state="drafting_queue",
                to_state="approval_review",
                details={"via": "comment_subagent"},
            ),
        ],
    )
    return {"generated_comment": comment, "content_state": updated[0] if updated else None}


@app.get("/v1/views/{view_name}", dependencies=[Depends(_require_auth)])
def read_view(
    view_name: str,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    relation = VIEW_MAP.get(view_name)
    if not relation:
        raise HTTPException(status_code=404, detail="Unknown view")
    return _queue_response(relation, limit=limit, offset=offset)


@app.get("/v1/queues/ready-to-publish", dependencies=[Depends(_require_auth)])
def read_ready_to_publish(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    return _queue_response("v_ready_to_publish", limit=limit, offset=offset)


@app.post("/v1/extension/tasks/{content_id}/status", dependencies=[Depends(_require_auth)])
def update_extension_status(content_id: UUID, request: ExtensionStatusRequest) -> dict[str, Any]:
    content_id_str = str(content_id)
    current_state = _read_state_or_404(content_id_str)

    posting_event = client.insert_one(
        "posting_events",
        {
            "content_id": content_id_str,
            "generated_comment_id": (
                str(request.generated_comment_id) if request.generated_comment_id else None
            ),
            "status": request.status,
            "error_message": request.error_message,
        },
    )

    if request.status == "submitted":
        txs = [
            tx_row(
                content_id=content_id_str,
                action="posted",
                actor=request.actor,
                actor_label=request.actor_label,
                details={"posting_event_id": posting_event["id"]},
            )
        ]
    else:
        updated = client.update_rows(
            "content_state",
            filters={"content_id": _to_eq(content_id_str)},
            changes={
                "is_trashed": True,
                "trashed_at": _now_iso(),
                "trashed_reason": "deleted_by_extension",
                "last_transition_at": _now_iso(),
            },
        )
        txs = [
            tx_row(
                content_id=content_id_str,
                action="trashed",
                actor=request.actor,
                actor_label=request.actor_label,
                from_state=current_state.get("state"),
                details={
                    "reason": "deleted_by_extension",
                    "posting_event_id": posting_event["id"],
                    "updated_state": updated[0] if updated else None,
                },
            )
        ]

    logged = log_transactions(client, txs)
    return {"posting_event": posting_event, "transactions": logged}
