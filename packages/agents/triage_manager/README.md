# Triage Manager

## Purpose

The triage manager is an optional automation layer that monitors queue health and applies routing or prioritization logic.

It should start rule-based and only use an LLM if there is a clear need.

## Position in workflow

This agent is cross-cutting rather than tied to a single queue.

Possible responsibilities include:

- prioritizing high-intent items
- identifying stale items
- auto-trashing clearly low-value content
- escalating risky or compliance-sensitive content for mandatory human review

## Responsibilities

- monitor queue age and backlog
- apply operational rules to improve flow through the system
- optionally recommend routing actions based on metadata and confidence
- keep automation reversible and auditable

## Expected inputs

- queue data from dashboard/API views
- transaction history
- timestamps and age in queue
- model confidence from upstream agents
- source and engagement metadata

## Expected outputs

Examples:

- priority score updates
- recommendations for auto-trash or escalation
- queue movement proposals
- operational alerts for backlog or stale inventory

## API endpoints this agent may use

Current API coverage is partial, so this agent should remain mostly documentary/planned until more queue transition endpoints exist.

Likely inputs:

- `GET /v1/views/{view_name}`
- `GET /v1/queues/ingested`
- `GET /v1/queues/drafting`
- `GET /v1/queues/ready-to-publish`

## Non-goals

- comment generation
- direct browser automation
- bypassing human approval for sensitive content

## Implementation guidance

Start this as a rules engine before adding any model usage.

Good first rules:

- flag items older than a threshold
- increase priority for broker-comparison and complaint posts
- suppress clearly stale items with low engagement

## Future implementation notes

Suggested files when implemented:

- `src/main.py`
- `src/rules.py`
- `src/client.py`
- `src/models.py`
- `src/config.py`
