from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from shared_utils import DBAPIClient, load_runtime_config, parse_common_args, run_loop


def cycle_factory() -> callable:
    runtime_config = load_runtime_config()
    db_api = DBAPIClient(runtime_config)
    views = [
        "ingested",
        "opportunity_review",
        "drafting_queue",
        "approval_review",
        "ready_to_publish",
    ]

    def cycle(*, limit: int) -> None:
        counts: dict[str, int | str] = {"mode": "read_only"}
        for view in views:
            try:
                payload = db_api.get_queue(f"/v1/views/{view}", limit=limit)
                counts[view] = int(payload.get("count", 0))
            except Exception as exc:
                counts[f"{view}_error"] = str(exc)
        print(json.dumps(counts))

    return runtime_config, cycle


def main() -> int:
    args = parse_common_args("Monitor queue health and print queue summaries.")
    runtime_config, cycle = cycle_factory()
    return run_loop(args=args, runtime_config=runtime_config, cycle_fn=cycle)


if __name__ == "__main__":
    raise SystemExit(main())
