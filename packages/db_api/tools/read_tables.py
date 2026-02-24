from __future__ import annotations

import json
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError

DB_API_DIR = Path(__file__).resolve().parents[1]
SRC_DIR = DB_API_DIR / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from utils.dotenv_utils import load_dotenv
from utils.supabase_reader import discover_tables, get_env_var, read_rows, require_project_url


def main() -> int:
    dotenv_path = DB_API_DIR / ".env"
    if not dotenv_path.exists():
        dotenv_path = SRC_DIR / ".env"
    env = load_dotenv(dotenv_path)

    api_key = get_env_var(env, "SUPABASE_SECRET_API_KEY")
    if not api_key:
        print("Missing SUPABASE_SECRET_API_KEY in env/.env", file=sys.stderr)
        return 1

    try:
        project_url = require_project_url(env)
        tables = discover_tables(project_url, api_key)
        if not tables:
            print("No tables discovered.")
            return 0

        for table in tables:
            rows = read_rows(project_url, api_key, table, limit=5)
            print(f"== {table} ({len(rows)} row sample) ==")
            print(json.dumps(rows, indent=2, ensure_ascii=True))
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        print(f"HTTP error: {exc.code} {exc.reason}", file=sys.stderr)
        if body:
            print(body, file=sys.stderr)
        return 1
    except URLError as exc:
        print(f"Network error: {exc.reason}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
