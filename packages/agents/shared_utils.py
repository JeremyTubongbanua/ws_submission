from __future__ import annotations

import argparse
import json
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def load_dotenv(dotenv_path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not dotenv_path.exists():
        return env

    for raw_line in dotenv_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip().strip("'").strip('"')
    return env


def load_agent_env() -> dict[str, str]:
    agents_dir = Path(__file__).resolve().parent
    env = load_dotenv(agents_dir / ".env")
    db_api_env = load_dotenv(agents_dir.parent / "db_api" / ".env")
    env.update(db_api_env)
    return env


def get_env_var(env: dict[str, str], key: str, default: str | None = None) -> str | None:
    return os.environ.get(key) or env.get(key) or default


class AgentError(RuntimeError):
    pass


@dataclass(slots=True)
class AgentRuntimeConfig:
    openai_api_key: str
    db_api_base_url: str
    db_api_service_token: str
    poll_interval_seconds: int
    request_timeout_seconds: int


def load_runtime_config(*, poll_interval_default: int = 60) -> AgentRuntimeConfig:
    env = load_agent_env()
    openai_api_key = get_env_var(env, "OPENAI_API_KEY")
    db_api_service_token = get_env_var(env, "DB_API_SERVICE_TOKEN")
    if not openai_api_key:
        raise AgentError("Missing OPENAI_API_KEY in packages/agents/.env")
    if not db_api_service_token:
        raise AgentError("Missing DB_API_SERVICE_TOKEN in packages/agents/.env or packages/db_api/.env")

    return AgentRuntimeConfig(
        openai_api_key=openai_api_key,
        db_api_base_url=(get_env_var(env, "DB_API_BASE_URL", "http://127.0.0.1:8000") or "http://127.0.0.1:8000").rstrip("/"),
        db_api_service_token=db_api_service_token,
        poll_interval_seconds=int(get_env_var(env, "AGENT_POLL_INTERVAL_SECONDS", str(poll_interval_default)) or str(poll_interval_default)),
        request_timeout_seconds=int(get_env_var(env, "AGENT_REQUEST_TIMEOUT_SECONDS", "60") or "60"),
    )


def parse_common_args(description: str) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument("--once", action="store_true", help="Run one cycle and exit.")
    parser.add_argument(
        "--run-forever",
        action="store_true",
        help="Run indefinitely instead of stopping after the default maximum of 5 cycles.",
    )
    parser.add_argument(
        "--interval-seconds",
        type=int,
        default=None,
        help="Override the polling interval.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=10,
        help="Maximum queue items to fetch per cycle.",
    )
    return parser.parse_args()


def run_loop(
    *,
    args: argparse.Namespace,
    runtime_config: AgentRuntimeConfig,
    cycle_fn: callable,
) -> int:
    if args.once:
        cycle_fn(limit=args.limit)
        return 0

    interval_seconds = args.interval_seconds or runtime_config.poll_interval_seconds
    max_cycles = None if args.run_forever else 5
    cycles_completed = 0

    while max_cycles is None or cycles_completed < max_cycles:
        cycle_fn(limit=args.limit)
        cycles_completed += 1
        if max_cycles is not None and cycles_completed >= max_cycles:
            break
        time.sleep(interval_seconds)
    return 0


def request_json(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    body: dict[str, Any] | None = None,
    timeout: int = 60,
) -> dict[str, Any] | list[dict[str, Any]]:
    request_headers = headers.copy() if headers else {}
    data: bytes | None = None
    if body is not None:
        request_headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")

    request = Request(url=url, method=method, headers=request_headers, data=data)
    try:
        with urlopen(request, timeout=timeout) as response:
            payload = response.read().decode("utf-8")
            return json.loads(payload) if payload else {}
    except HTTPError as exc:
        body_text = exc.read().decode("utf-8", errors="replace")
        raise AgentError(f"HTTP {exc.code} for {url}: {body_text}") from exc
    except URLError as exc:
        raise AgentError(f"Network error for {url}: {exc.reason}") from exc


class DBAPIClient:
    def __init__(self, runtime_config: AgentRuntimeConfig) -> None:
        self.base_url = runtime_config.db_api_base_url
        self.timeout = runtime_config.request_timeout_seconds
        self.headers = {
            "Accept": "application/json",
            "X-API-Key": runtime_config.db_api_service_token,
        }

    def get_queue(self, path: str, *, limit: int) -> dict[str, Any]:
        query = urlencode({"limit": limit, "offset": 0})
        payload = request_json(
            f"{self.base_url}{path}?{query}",
            headers=self.headers,
            timeout=self.timeout,
        )
        return payload if isinstance(payload, dict) else {}

    def post(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        payload = request_json(
            f"{self.base_url}{path}",
            method="POST",
            headers=self.headers,
            body=body,
            timeout=self.timeout,
        )
        return payload if isinstance(payload, dict) else {}


class OpenAIResponsesClient:
    def __init__(self, runtime_config: AgentRuntimeConfig) -> None:
        self.api_key = runtime_config.openai_api_key
        self.timeout = runtime_config.request_timeout_seconds

    def json_completion(
        self,
        *,
        model: str,
        instructions: str,
        input_text: str,
    ) -> dict[str, Any]:
        payload = request_json(
            "https://api.openai.com/v1/responses",
            method="POST",
            headers={
                "Accept": "application/json",
                "Authorization": f"Bearer {self.api_key}",
            },
            body={
                "model": model,
                "instructions": instructions,
                "input": f"Return valid JSON only.\n\n{input_text}",
                "store": False,
                "text": {"format": {"type": "json_object"}},
            },
            timeout=self.timeout,
        )
        if not isinstance(payload, dict):
            raise AgentError("Unexpected OpenAI response format")

        output_text = payload.get("output_text")
        if isinstance(output_text, str) and output_text.strip():
            return json.loads(output_text)

        for item in payload.get("output", []):
            if item.get("type") != "message":
                continue
            for content in item.get("content", []):
                if content.get("type") == "output_text" and isinstance(content.get("text"), str):
                    return json.loads(content["text"])

        raise AgentError("OpenAI response did not contain JSON output text")
