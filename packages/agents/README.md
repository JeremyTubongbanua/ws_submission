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

This commit only creates the documentation scaffolding.
