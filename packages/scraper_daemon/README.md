# Scraper Daemon

This package contains the first scraper implementation for the workflow studio project.

## What it does

It reads the configured subreddit list from `defined_lists.json`, fetches the newest posts from each subreddit with the same per-subreddit limit, fetches a small sample of top-level comments for each post, and sends each post to the DB API ingest endpoint.

Subreddit weighting behavior:

- every configured subreddit is fetched independently
- each subreddit gets the same fetch limit
- posts are ingested in round-robin order across subreddits

That means the scraper gives equal weight to:

- `r/PersonalFinanceCanada`
- `r/Questrade`
- `r/Wealthsimple`
- `r/JustBuyXEQT`

Ingestion happens through:

- `POST /v1/content/ingest`

The scraper is duplicate-safe because the DB API checks `source + source_content_id` before creating a new row.

## Current defined lists

The current subreddit list is stored in [defined_lists.json](/Users/jeremytubongbanua/GitHub/ws_submission/packages/scraper_daemon/defined_lists.json):

- `r/PersonalFinanceCanada`
- `r/Questrade`
- `r/Wealthsimple`
- `r/JustBuyXEQT`

## Environment

Create `packages/scraper_daemon/.env` with:

```bash
DB_API_BASE_URL=http://127.0.0.1:8000
DB_API_SERVICE_TOKEN=your_db_api_service_token
REDDIT_FETCH_LIMIT=25
REDDIT_COMMENT_SAMPLE_LIMIT=5
SCRAPER_POLL_INTERVAL_SECONDS=300
REQUEST_DELAY_SECONDS=15
REDDIT_USER_AGENT=ws-submission-scraper/0.1
```

`REQUEST_DELAY_SECONDS=15` means the scraper will wait 15 seconds between outbound requests. That pacing applies across:

- subreddit listing fetches
- Reddit comment fetches
- DB API ingest calls

## How to run

One scrape cycle:

```bash
cd packages/scraper_daemon
uv run python src/reddit_scraper.py --once
```

Continuous polling:

```bash
cd packages/scraper_daemon
uv run python src/reddit_scraper.py
```

By default, daemon mode stops after 5 scrape cycles.

Run indefinitely only when you explicitly opt in:

```bash
cd packages/scraper_daemon
uv run python src/reddit_scraper.py --run-forever
```

Or use the helper script:

```bash
packages/scraper_daemon/tools/run_scraper.sh
```

## API mode

The scraper daemon also exposes a manual control API on port `8001`.

Run it with:

```bash
packages/scraper_daemon/tools/run_scraper_api.sh
```

Endpoints:

- `GET /health`
- `POST /run`

Example:

```bash
curl -s -X POST http://127.0.0.1:8001/run \
  -H "Content-Type: application/json" \
  -d '{"cycles": 5, "limit": 1}'
```

In manual API mode, `cycles=5` and `limit=1` means the scraper will ingest at most 5 posts total.

## Output

Each run prints a JSON summary like:

```json
{
  "timestamp": "2026-03-02T12:00:00+00:00",
  "subreddits_checked": 4,
  "posts_seen": 100,
  "created": 12,
  "duplicates": 88,
  "errors": 0
}
```

## How relevance works right now

Right now relevance is defined only by subreddit membership. If a post appears in one of the configured subreddits, the scraper attempts to ingest it.

## What comment info is stored

The scraper stores comment context in `raw_payload` for each ingested Reddit post.

Current comment fields:

- `comment_summary.sampled_count`
- `comment_summary.authors`
- `top_level_comments`

Each sampled top-level comment includes:

- `id`
- `author`
- `body`
- `score`
- `created_utc`
- `permalink`
- `parent_id`
- `is_submitter`

This keeps the current database schema unchanged while making the ingested rows much more useful for later filtering and classification.

There is no keyword filtering or LLM classification in this package yet. That belongs in the next layer of the workflow after ingestion.
