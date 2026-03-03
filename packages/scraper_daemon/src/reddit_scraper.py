from __future__ import annotations

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from itertools import zip_longest
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
        value = value.strip().strip("'").strip('"')
        env[key.strip()] = value

    return env


def get_env_var(env: dict[str, str], key: str, default: str | None = None) -> str | None:
    return os.environ.get(key) or env.get(key) or default


class ScraperError(RuntimeError):
    pass


@dataclass(slots=True)
class ScraperConfig:
    db_api_base_url: str
    db_api_service_token: str
    subreddits: list[str]
    reddit_sort: str = "new"
    reddit_limit: int = 25
    poll_interval_seconds: int = 300
    actor_label: str = "scraper-daemon"
    user_agent: str = "ws-submission-scraper/0.1"
    comment_sample_limit: int = 5
    request_delay_seconds: float = 15.0


def load_config() -> ScraperConfig:
    package_dir = Path(__file__).resolve().parents[1]
    env = load_dotenv(package_dir / ".env")
    env.update(load_dotenv(package_dir / "src" / ".env"))

    db_api_base_url = get_env_var(env, "DB_API_BASE_URL", "http://127.0.0.1:8000")
    db_api_service_token = get_env_var(env, "DB_API_SERVICE_TOKEN")
    if not db_api_service_token:
        raise ScraperError("Missing DB_API_SERVICE_TOKEN in scraper_daemon/.env")

    defined_lists_path = package_dir / "defined_lists.json"
    defined_lists = json.loads(defined_lists_path.read_text(encoding="utf-8"))
    subreddits = defined_lists.get("subreddits", [])
    if not isinstance(subreddits, list) or not subreddits:
        raise ScraperError("defined_lists.json must contain a non-empty 'subreddits' list")

    return ScraperConfig(
        db_api_base_url=db_api_base_url.rstrip("/"),
        db_api_service_token=db_api_service_token,
        subreddits=[str(item).strip() for item in subreddits if str(item).strip()],
        reddit_sort=get_env_var(env, "REDDIT_SORT", "new") or "new",
        reddit_limit=int(get_env_var(env, "REDDIT_FETCH_LIMIT", "25") or "25"),
        poll_interval_seconds=int(get_env_var(env, "SCRAPER_POLL_INTERVAL_SECONDS", "300") or "300"),
        actor_label=get_env_var(env, "SCRAPER_ACTOR_LABEL", "scraper-daemon") or "scraper-daemon",
        user_agent=get_env_var(env, "REDDIT_USER_AGENT", "ws-submission-scraper/0.1")
        or "ws-submission-scraper/0.1",
        comment_sample_limit=int(get_env_var(env, "REDDIT_COMMENT_SAMPLE_LIMIT", "5") or "5"),
        request_delay_seconds=float(get_env_var(env, "REQUEST_DELAY_SECONDS", "15") or "15"),
    )


class RequestPacer:
    def __init__(self, delay_seconds: float) -> None:
        self.delay_seconds = max(0.0, delay_seconds)
        self._last_request_at: float | None = None

    def wait(self) -> None:
        if self._last_request_at is None:
            self._last_request_at = time.monotonic()
            return

        elapsed = time.monotonic() - self._last_request_at
        remaining = self.delay_seconds - elapsed
        if remaining > 0:
            time.sleep(remaining)
        self._last_request_at = time.monotonic()


PACER = RequestPacer(0.0)


def request_json(url: str, *, headers: dict[str, str]) -> dict[str, Any]:
    PACER.wait()
    request = Request(url=url, method="GET", headers=headers)
    try:
        with urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise ScraperError(f"HTTP {exc.code} for {url}: {body}") from exc
    except URLError as exc:
        raise ScraperError(f"Network error for {url}: {exc.reason}") from exc


def post_json(url: str, *, headers: dict[str, str], body: dict[str, Any]) -> dict[str, Any]:
    PACER.wait()
    request = Request(
        url=url,
        method="POST",
        headers={"Content-Type": "application/json", **headers},
        data=json.dumps(body).encode("utf-8"),
    )
    try:
        with urlopen(request, timeout=30) as response:
            payload = response.read().decode("utf-8")
            return json.loads(payload) if payload else {}
    except HTTPError as exc:
        body_text = exc.read().decode("utf-8", errors="replace")
        raise ScraperError(f"HTTP {exc.code} for {url}: {body_text}") from exc
    except URLError as exc:
        raise ScraperError(f"Network error for {url}: {exc.reason}") from exc


def reddit_listing_url(subreddit: str, *, sort: str, limit: int) -> str:
    query = urlencode({"limit": limit, "raw_json": 1})
    return f"https://www.reddit.com/r/{subreddit}/{sort}.json?{query}"


def fetch_subreddit_posts(config: ScraperConfig, subreddit: str) -> list[dict[str, Any]]:
    url = reddit_listing_url(subreddit, sort=config.reddit_sort, limit=config.reddit_limit)
    payload = request_json(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": config.user_agent,
        },
    )
    children = payload.get("data", {}).get("children", [])
    posts: list[dict[str, Any]] = []
    for child in children:
        if child.get("kind") != "t3":
            continue
        data = child.get("data", {})
        if not isinstance(data, dict):
            continue
        posts.append(data)
    return posts


def reddit_comments_url(permalink: str, *, limit: int) -> str:
    clean_permalink = permalink[:-1] if permalink.endswith("/") else permalink
    query = urlencode({"limit": limit, "depth": 1, "raw_json": 1, "sort": "top"})
    return f"https://www.reddit.com{clean_permalink}.json?{query}"


def fetch_post_comments(config: ScraperConfig, permalink: str) -> list[dict[str, Any]]:
    if not permalink.startswith("/"):
        return []

    payload = request_json(
        reddit_comments_url(permalink, limit=config.comment_sample_limit),
        headers={
            "Accept": "application/json",
            "User-Agent": config.user_agent,
        },
    )
    if not isinstance(payload, list) or len(payload) < 2:
        return []

    comments_listing = payload[1]
    children = comments_listing.get("data", {}).get("children", [])
    comments: list[dict[str, Any]] = []
    for child in children:
        if child.get("kind") != "t1":
            continue
        data = child.get("data", {})
        if not isinstance(data, dict):
            continue
        comments.append(data)
    return comments


def compact_comment(comment: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": comment.get("name") or comment.get("id"),
        "author": comment.get("author"),
        "body": comment.get("body") or "",
        "score": comment.get("score"),
        "created_utc": comment.get("created_utc"),
        "permalink": comment.get("permalink"),
        "parent_id": comment.get("parent_id"),
        "is_submitter": comment.get("is_submitter"),
    }


def comment_summary(comments: list[dict[str, Any]]) -> dict[str, Any]:
    authors = [comment.get("author") for comment in comments if comment.get("author")]
    return {
        "sampled_count": len(comments),
        "authors": authors,
    }


def reddit_post_to_ingest_payload(config: ScraperConfig, post: dict[str, Any]) -> dict[str, Any]:
    permalink = post.get("permalink") or ""
    source_url = f"https://www.reddit.com{permalink}" if permalink.startswith("/") else post.get("url")
    created_utc = post.get("created_utc")
    source_created_at = None
    if isinstance(created_utc, (int, float)):
        source_created_at = datetime.fromtimestamp(created_utc, tz=timezone.utc).isoformat()
    try:
        comments = fetch_post_comments(config, permalink)
    except ScraperError:
        comments = []
    compact_comments = [compact_comment(comment) for comment in comments[: config.comment_sample_limit]]

    return {
        "source": "reddit",
        "source_content_id": post.get("name") or post.get("id"),
        "source_url": source_url,
        "source_author": post.get("author"),
        "source_created_at": source_created_at,
        "title": post.get("title"),
        "body_text": post.get("selftext") or "",
        "raw_payload": {
            "subreddit": post.get("subreddit"),
            "score": post.get("score"),
            "num_comments": post.get("num_comments"),
            "permalink": permalink,
            "over_18": post.get("over_18"),
            "is_self": post.get("is_self"),
            "domain": post.get("domain"),
            "outbound_url": post.get("url"),
            "comment_summary": comment_summary(compact_comments),
            "top_level_comments": compact_comments,
        },
        "actor": "system",
        "actor_label": config.actor_label,
    }


def ingest_post(config: ScraperConfig, payload: dict[str, Any]) -> dict[str, Any]:
    return post_json(
        f"{config.db_api_base_url}/v1/content/ingest",
        headers={
            "Accept": "application/json",
            "X-API-Key": config.db_api_service_token,
        },
        body=payload,
    )


def run_once(config: ScraperConfig) -> dict[str, int]:
    stats = {
        "subreddits_checked": 0,
        "posts_seen": 0,
        "created": 0,
        "duplicates": 0,
        "errors": 0,
    }

    posts_by_subreddit: dict[str, list[dict[str, Any]]] = {}

    for subreddit in config.subreddits:
        stats["subreddits_checked"] += 1
        try:
            posts_by_subreddit[subreddit] = fetch_subreddit_posts(config, subreddit)
        except ScraperError as exc:
            stats["errors"] += 1
            posts_by_subreddit[subreddit] = []
            print(f"[error] fetch r/{subreddit}: {exc}", file=sys.stderr)

    for round_posts in zip_longest(*(posts_by_subreddit[subreddit] for subreddit in config.subreddits)):
        for subreddit, post in zip(config.subreddits, round_posts):
            if post is None:
                continue

            stats["posts_seen"] += 1
            payload = reddit_post_to_ingest_payload(config, post)
            if not payload.get("source_content_id") or not payload.get("source_url"):
                stats["errors"] += 1
                print(f"[error] skipped malformed post in r/{subreddit}", file=sys.stderr)
                continue

            try:
                result = ingest_post(config, payload)
            except ScraperError as exc:
                stats["errors"] += 1
                identifier = payload.get("source_content_id")
                print(f"[error] ingest {identifier}: {exc}", file=sys.stderr)
                continue

            if result.get("created"):
                stats["created"] += 1
            else:
                stats["duplicates"] += 1

    return stats


def print_stats(stats: dict[str, int]) -> None:
    timestamp = datetime.now(timezone.utc).isoformat()
    print(
        json.dumps(
            {
                "timestamp": timestamp,
                **stats,
            }
        )
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scrape configured Reddit subreddits into the DB API.")
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run one scrape cycle and exit.",
    )
    parser.add_argument(
        "--interval-seconds",
        type=int,
        default=None,
        help="Override the polling interval for daemon mode.",
    )
    return parser.parse_args()


def main() -> int:
    global PACER
    args = parse_args()
    try:
        config = load_config()
    except ScraperError as exc:
        print(f"[fatal] {exc}", file=sys.stderr)
        return 1

    PACER = RequestPacer(config.request_delay_seconds)

    if args.once:
        print_stats(run_once(config))
        return 0

    interval_seconds = args.interval_seconds or config.poll_interval_seconds
    while True:
        print_stats(run_once(config))
        time.sleep(interval_seconds)


if __name__ == "__main__":
    raise SystemExit(main())
