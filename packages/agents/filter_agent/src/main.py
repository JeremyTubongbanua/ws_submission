from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from shared_utils import AgentError, DBAPIClient, OpenAIResponsesClient, load_agent_env, load_runtime_config, parse_common_args, run_loop

MAX_MOVES_PER_CYCLE = 5


def build_input_text(item: dict[str, Any]) -> str:
    payload = item.get("raw_payload") or {}
    comments = payload.get("top_level_comments") or []
    compact_comments = []
    for comment in comments[:5]:
        compact_comments.append(
            {
                "author": comment.get("author"),
                "body": comment.get("body"),
                "score": comment.get("score"),
            }
        )

    return json.dumps(
        {
            "source": item.get("source"),
            "source_url": item.get("source_url"),
            "title": item.get("title"),
            "body_text": item.get("body_text"),
            "subreddit": payload.get("subreddit"),
            "score": payload.get("score"),
            "num_comments": payload.get("num_comments"),
            "top_level_comments": compact_comments,
        },
        ensure_ascii=True,
    )


def classify_item(llm: OpenAIResponsesClient, *, model: str, item: dict[str, Any]) -> dict[str, Any]:
    instructions = (
        "You are the filter agent for a Wealthsimple workflow. "
        "Return JSON only. Decide whether content should move to opportunity review or be trashed. "
        "Favor move_to_opportunity_review only for content clearly relevant to personal finance, investing, broker comparisons, product friction, transfer questions, account issues, or adjacent Wealthsimple opportunities. "
        "Trash memes, low-signal posts, off-topic content, and anything that would require individualized financial advice. "
        "Return an object with keys: decision, confidence, reason, tags. "
        "decision must be exactly one of: move_to_opportunity_review, trash. "
        "confidence must be a number between 0 and 1. "
        "tags must be an array of short strings."
    )
    result = llm.json_completion(model=model, instructions=instructions, input_text=build_input_text(item))
    decision = result.get("decision")
    if decision not in {"move_to_opportunity_review", "trash"}:
        raise AgentError(f"Unexpected filter decision: {decision}")
    confidence = result.get("confidence", 0)
    try:
        confidence = float(confidence)
    except (TypeError, ValueError) as exc:
        raise AgentError("Filter confidence was not numeric") from exc
    return {
        "decision": decision,
        "confidence": max(0.0, min(1.0, confidence)),
        "reason": str(result.get("reason") or ""),
        "tags": [str(tag) for tag in (result.get("tags") or [])][:10],
    }


def cycle_factory() -> callable:
    runtime_config = load_runtime_config()
    env = load_agent_env()
    model = env.get("FILTER_AGENT_MODEL", "gpt-4o-mini")
    db_api = DBAPIClient(runtime_config)
    llm = OpenAIResponsesClient(runtime_config)

    def cycle(*, limit: int) -> None:
        queue = db_api.get_queue("/v1/queues/ingested", limit=limit)
        items = queue.get("items", [])
        stats = {"processed": 0, "moved": 0, "trashed": 0, "errors": 0}
        moves_remaining = MAX_MOVES_PER_CYCLE

        for item in items:
            try:
                decision = classify_item(llm, model=model, item=item)
                decision_value = decision["decision"]
                if decision_value == "move_to_opportunity_review" and moves_remaining <= 0:
                    decision_value = "trash"
                    decision["reason"] = (
                        "move_limit_reached_for_cycle; deferred by filter-agent operating cap"
                    )
                    decision["tags"] = [*decision["tags"], "move-limit-reached"][:10]

                db_api.post(
                    f"/v1/queues/ingested/{item['id']}/classify",
                    {
                        "decision": decision_value,
                        "actor": "agent",
                        "actor_label": "filter-agent",
                        "details": {
                            "confidence": decision["confidence"],
                            "reason": decision["reason"],
                            "tags": decision["tags"],
                        },
                        "reason": decision["reason"] if decision_value == "trash" else None,
                    },
                )
                stats["processed"] += 1
                if decision_value == "trash":
                    stats["trashed"] += 1
                else:
                    stats["moved"] += 1
                    moves_remaining -= 1
            except Exception as exc:
                stats["errors"] += 1
                print(f"[error] filter_agent item {item.get('id')}: {exc}", file=sys.stderr)

        print(json.dumps(stats))
        return stats

    return runtime_config, cycle


def main() -> int:
    args = parse_common_args("Filter ingested queue items and classify them.")
    runtime_config, cycle = cycle_factory()
    return run_loop(args=args, runtime_config=runtime_config, cycle_fn=cycle)


if __name__ == "__main__":
    raise SystemExit(main())
