# Ports

This document tracks the local development ports for the main actors and agents in the project.

## Actors

- Frontend dashboard: `3000`
  - command: `cd packages/dashboard && npm run dev`
- DB API: `8000`
  - command: `packages/db_api/tools/run_db_api.sh`

## Agents

- Scraper Daemon API: `8001`
  - command: `packages/scraper_daemon/tools/run_scraper_api.sh`
  - endpoints:
    - `GET /health`
    - `POST /run`
- Filter Agent API: `8002`
  - command: `packages/agents/filter_agent/tools/run_filter_agent_api.sh`
  - endpoints:
    - `GET /health`
    - `POST /run`
- Comment Agent API: `8003`
  - command: `packages/agents/comment_agent/tools/run_comment_agent_api.sh`
  - endpoints:
    - `GET /health`
    - `POST /run`

## Dashboard proxy routes

The Next.js frontend proxies manual control requests through:

- `POST /api/agents/scraper_daemon/run`
- `POST /api/agents/filter_agent/run`
- `POST /api/agents/comment_agent/run`

These proxy routes default to the local agent ports above unless overridden with env vars in the dashboard process:

- `SCRAPER_DAEMON_BASE_URL`
- `FILTER_AGENT_BASE_URL`
- `COMMENT_AGENT_BASE_URL`

## Run semantics

Each agent API is manual by default.

- `POST /run` accepts bounded execution
- `cycles` defaults to `5`
- `cycles` is capped at `5`

Example request body:

```json
{
  "cycles": 5,
  "limit": 1
}
```

For dashboard-triggered manual runs, `cycles=5` with `limit=1` means each actor processes at most 5 total items.
