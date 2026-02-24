from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


class SupabaseAPIError(RuntimeError):
    def __init__(self, message: str, *, status_code: int = 500, body: str = "") -> None:
        super().__init__(message)
        self.status_code = status_code
        self.body = body


@dataclass(slots=True)
class SupabaseClient:
    project_url: str
    api_key: str

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        body: dict[str, Any] | list[dict[str, Any]] | None = None,
        extra_headers: dict[str, str] | None = None,
    ) -> dict[str, Any] | list[dict[str, Any]]:
        query = f"?{urlencode(params, doseq=True)}" if params else ""
        url = f"{self.project_url}/rest/v1/{path}{query}"

        headers = {
            "apikey": self.api_key,
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "application/json",
        }
        if extra_headers:
            headers.update(extra_headers)

        data: bytes | None = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body).encode("utf-8")

        request = Request(url=url, method=method, headers=headers, data=data)
        try:
            with urlopen(request, timeout=30) as response:
                text = response.read().decode("utf-8")
                if not text:
                    return {}
                parsed = json.loads(text)
                if isinstance(parsed, (dict, list)):
                    return parsed
                raise SupabaseAPIError("Unexpected Supabase response format", status_code=502)
        except HTTPError as exc:
            body_text = exc.read().decode("utf-8", errors="replace")
            raise SupabaseAPIError(
                f"Supabase HTTP error {exc.code}", status_code=exc.code, body=body_text
            ) from exc
        except URLError as exc:
            raise SupabaseAPIError(f"Supabase network error: {exc.reason}", status_code=502) from exc

    def list_rows(
        self,
        relation: str,
        *,
        limit: int = 50,
        offset: int = 0,
        filters: dict[str, str] | None = None,
        columns: str = "*",
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "select": columns,
            "limit": limit,
            "offset": offset,
        }
        if filters:
            params.update(filters)
        payload = self._request("GET", relation, params=params)
        return payload if isinstance(payload, list) else []

    def get_one(
        self,
        relation: str,
        *,
        filters: dict[str, str],
        columns: str = "*",
    ) -> dict[str, Any] | None:
        rows = self.list_rows(relation, limit=1, offset=0, filters=filters, columns=columns)
        return rows[0] if rows else None

    def insert_one(self, table: str, row: dict[str, Any]) -> dict[str, Any]:
        payload = self._request(
            "POST",
            table,
            params={"select": "*"},
            body=row,
            extra_headers={"Prefer": "return=representation"},
        )
        if isinstance(payload, list) and payload:
            return payload[0]
        if isinstance(payload, dict):
            return payload
        raise SupabaseAPIError("Insert returned empty payload", status_code=502)

    def insert_many(self, table: str, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        payload = self._request(
            "POST",
            table,
            params={"select": "*"},
            body=rows,
            extra_headers={"Prefer": "return=representation"},
        )
        if isinstance(payload, list):
            return payload
        if isinstance(payload, dict):
            return [payload]
        return []

    def update_rows(
        self,
        table: str,
        *,
        filters: dict[str, str],
        changes: dict[str, Any],
    ) -> list[dict[str, Any]]:
        payload = self._request(
            "PATCH",
            table,
            params={"select": "*", **filters},
            body=changes,
            extra_headers={"Prefer": "return=representation"},
        )
        if isinstance(payload, list):
            return payload
        if isinstance(payload, dict):
            return [payload]
        return []
