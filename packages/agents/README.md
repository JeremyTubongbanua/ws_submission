# Agents

This directory contains the planned AI agent packages for the Workflow Studio pipeline.

## Planned agents

- `filter_agent`: decides whether newly ingested content should move forward or be trashed
- `comment_agent`: generates draft replies for items in the drafting queue
- `triage_manager`: optional automation layer for prioritization, auto-routing, and stale-item handling

## Why separate packages

Each agent should be independently runnable and independently configurable.

That gives you:

- clearer ownership of each workflow stage
- simpler prompts and evaluation
- isolated failures
- better observability and retry behavior

## Shared design rules

- agents should read from and write to the DB API, not directly to Supabase
- every agent should produce structured JSON outputs, not free-form decisions
- every agent should log enough metadata for later debugging and evaluation
- human review remains part of the workflow for approval-sensitive actions

## Suggested package structure

Each agent package can eventually contain:

- `README.md`
- `src/main.py`
- `src/client.py`
- `src/prompts/`
- `src/models.py`
- `.env`

## Current implementation

The repository now includes runnable worker entry points for:

- `filter_agent`
- `comment_agent`
- `triage_manager`

Shared runtime code lives in [shared_utils.py](/Users/jeremytubongbanua/GitHub/ws_submission/packages/agents/shared_utils.py).

## Shared environment

The agents read `packages/agents/.env`.

Current required values:

- `OPENAI_API_KEY`

Useful optional values:

- `DB_API_BASE_URL`
- `DB_API_SERVICE_TOKEN`
- `AGENT_POLL_INTERVAL_SECONDS`
- `AGENT_REQUEST_TIMEOUT_SECONDS`
- `FILTER_AGENT_MODEL`
- `COMMENT_AGENT_MODEL`

If `DB_API_SERVICE_TOKEN` is not set in `packages/agents/.env`, the agents also fall back to `packages/db_api/.env`.

## Runtime behavior

All agents support the same loop flags:

- `--once`: run one cycle
- default: run up to 5 cycles
- `--run-forever`: run indefinitely

They also support:

- `--interval-seconds`
- `--limit`

## Manual control APIs

The agents are also intended to run as local FastAPI services so the frontend can trigger bounded runs manually.

Default local ports:

- filter agent API: `8002`
- comment agent API: `8003`

Service endpoints:

- `GET /health`
- `POST /run`

The dashboard should call these services instead of expecting the agents to poll forever on their own.
