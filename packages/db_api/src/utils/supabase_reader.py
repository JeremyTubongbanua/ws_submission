from __future__ import annotations

import json
import os
from urllib.parse import quote
from urllib.request import Request, urlopen


def get_env_var(env: dict[str, str], key: str) -> str | None:
    return os.environ.get(key) or env.get(key)


def require_project_url(env: dict[str, str]) -> str:
    for key in ("SUPABASE_URL", "SUPABASE_PROJECT_URL", "NEXT_PUBLIC_SUPABASE_URL"):
        value = get_env_var(env, key)
        if value:
            return value.rstrip("/")
    project_ref = get_env_var(env, "SUPABASE_PROJECT_REF")
    if project_ref:
        return f"https://{project_ref}.supabase.co"
    raise RuntimeError(
        "Missing SUPABASE_URL/SUPABASE_PROJECT_URL/NEXT_PUBLIC_SUPABASE_URL "
        "or SUPABASE_PROJECT_REF in env/.env"
    )


def request_json(url: str, api_key: str) -> dict | list:
    request = Request(
        url=url,
        headers={
            "apikey": api_key,
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        },
        method="GET",
    )
    with urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def discover_tables(project_url: str, api_key: str) -> list[str]:
    openapi = request_json(f"{project_url}/rest/v1/", api_key)
    paths = openapi.get("paths", {}) if isinstance(openapi, dict) else {}

    tables: list[str] = []
    for path in paths:
        if path.startswith("/rpc/"):
            continue
        table = path.lstrip("/")
        if table:
            tables.append(table)
    return sorted(set(tables))


def read_rows(project_url: str, api_key: str, table: str, limit: int = 200) -> list[dict]:
    table_path = quote(table, safe="")
    url = f"{project_url}/rest/v1/{table_path}?select=*&limit={limit}"
    payload = request_json(url, api_key)
    return payload if isinstance(payload, list) else []
