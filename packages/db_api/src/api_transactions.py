from __future__ import annotations

from typing import Any

from api_db import SupabaseClient


def tx_row(
    *,
    content_id: str,
    action: str,
    actor: str = "system",
    actor_label: str | None = None,
    from_state: str | None = None,
    to_state: str | None = None,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    row: dict[str, Any] = {
        "content_id": content_id,
        "action": action,
        "actor": actor,
        "details": details or {},
    }
    if actor_label is not None:
        row["actor_label"] = actor_label
    if from_state is not None:
        row["from_state"] = from_state
    if to_state is not None:
        row["to_state"] = to_state
    return row


def log_transactions(client: SupabaseClient, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not rows:
        return []
    return client.insert_many("transactions", rows)
