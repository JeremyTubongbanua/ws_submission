from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from shared_utils import DBAPIClient, OpenAIResponsesClient, load_agent_env, load_runtime_config, parse_common_args, run_loop


def build_input_text(item: dict[str, Any]) -> str:
    payload = item.get("raw_payload") or {}
    comments = payload.get("top_level_comments") or []
    return json.dumps(
        {
            "source": item.get("source"),
            "source_url": item.get("source_url"),
            "title": item.get("title"),
            "body_text": item.get("body_text"),
            "subreddit": payload.get("subreddit"),
            "score": payload.get("score"),
            "num_comments": payload.get("num_comments"),
            "top_level_comments": comments[:5],
        },
        ensure_ascii=True,
    )


def generate_comment(llm: OpenAIResponsesClient, *, model: str, item: dict[str, Any]) -> dict[str, Any]:
    instructions = (
        "You are the comment agent for Wealthsimple-related community engagement. "
        "Return JSON only. Generate a single concise draft comment. "
        "The comment must sound human, calm, and conversational, not like a corporate script. "
        "Keep the draft to 1-2 sentences total. "
        "Do not provide personalized financial advice, security recommendations, or portfolio instructions. "
        "Prefer clarifying questions, light educational framing, or acknowledging the user's frustration when appropriate. "
        "When it naturally fits, lightly reference a relevant Wealthsimple offering such as self-directed investing, managed investing, cash, account transfers, or account types, but do not force a mention if it would sound unnatural. "
        "Avoid hype, emojis, exclamation-heavy copy, and hard sells. "
        "Return an object with keys: draft_text, safety_flags, rationale. "
        "safety_flags must be an object and include financial_advice and compliance_review_needed booleans."
    )
    result = llm.json_completion(model=model, instructions=instructions, input_text=build_input_text(item))
    safety_flags = result.get("safety_flags") if isinstance(result.get("safety_flags"), dict) else {}
    return {
        "draft_text": str(result.get("draft_text") or "").strip(),
        "safety_flags": {
            "financial_advice": bool(safety_flags.get("financial_advice", False)),
            "compliance_review_needed": bool(safety_flags.get("compliance_review_needed", False)),
        },
        "rationale": str(result.get("rationale") or ""),
    }


def cycle_factory() -> callable:
    runtime_config = load_runtime_config()
    env = load_agent_env()
    model = env.get("COMMENT_AGENT_MODEL", "gpt-4o-mini")
    db_api = DBAPIClient(runtime_config)
    llm = OpenAIResponsesClient(runtime_config)

    def cycle(*, limit: int) -> None:
        queue = db_api.get_queue("/v1/queues/drafting", limit=limit)
        items = queue.get("items", [])
        stats = {"processed": 0, "generated": 0, "errors": 0}

        for item in items:
            try:
                result = generate_comment(llm, model=model, item=item)
                if not result["draft_text"]:
                    raise RuntimeError("Generated empty draft_text")
                db_api.post(
                    f"/v1/queues/drafting/{item['id']}/generate-comment",
                    {
                        "draft_text": result["draft_text"],
                        "model_name": model,
                        "model_temperature": 0.2,
                        "prompt_version": "v1",
                        "safety_flags": {
                            **result["safety_flags"],
                            "rationale": result["rationale"],
                        },
                        "is_selected": True,
                        "actor": "agent",
                        "actor_label": "comment-agent",
                    },
                )
                stats["processed"] += 1
                stats["generated"] += 1
            except Exception as exc:
                stats["errors"] += 1
                print(f"[error] comment_agent item {item.get('id')}: {exc}", file=sys.stderr)

        print(json.dumps(stats))
        return stats

    return runtime_config, cycle


def main() -> int:
    args = parse_common_args("Generate comments for drafting queue items.")
    runtime_config, cycle = cycle_factory()
    return run_loop(args=args, runtime_config=runtime_config, cycle_fn=cycle)


if __name__ == "__main__":
    raise SystemExit(main())
