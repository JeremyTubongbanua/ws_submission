# Comment Agent

## Purpose

The comment agent reads items in the drafting queue and generates candidate replies for human review.

This is the writing-focused agent in the system.

## Position in workflow

- input state: `drafting_queue`
- output state: `approval_review`

## Responsibilities

- generate short, useful, brand-safe comments
- reflect Wealthsimple context without sounding robotic or overly promotional
- avoid personalized financial advice
- ask clarifying questions when the source content is ambiguous
- attach model metadata and safety flags with the generated draft

## Expected inputs

From the queue item:

- title
- body text
- sampled comments
- source URL
- subreddit/source context
- optional policy and brand voice guidance

## Expected outputs

The generated result should be structured and include at least:

```json
{
  "draft_text": "Totally fair question. Are you mainly optimizing for fees, ease of use, or available account types?",
  "model_name": "your-model",
  "safety_flags": {
    "financial_advice": false,
    "compliance_review_needed": false
  }
}
```

## API endpoints this agent should use

- `GET /v1/queues/drafting`
- `POST /v1/queues/drafting/{content_id}/generate-comment`

## Non-goals

- final approval or publishing
- directly submitting a reply on-platform
- direct database writes

## Prompting guidance

The comment agent should optimize for:

- concise helpfulness
- natural platform tone
- light touch brand alignment
- no hard sell
- no individualized financial instruction

## Future implementation notes

Suggested files when implemented:

- `src/main.py`
- `src/client.py`
- `src/prompt.md`
- `src/policies.md`
- `src/models.py`
- `src/examples.json`

## Current implementation

This agent is now runnable at [src/main.py](/Users/jeremytubongbanua/GitHub/ws_submission/packages/agents/comment_agent/src/main.py).

It:

- reads `GET /v1/queues/drafting`
- sends each item to OpenAI for JSON draft generation
- posts results to `POST /v1/queues/drafting/{content_id}/generate-comment`

## How to run

From the repo root:

```bash
cd packages/agents/comment_agent
uv run python src/main.py --once
```

Default behavior:

- `--once`: one cycle
- no flag: up to 5 cycles
- `--run-forever`: continuous polling

## API mode

This agent also exposes a manual control API on port `8003`.

Run it with:

```bash
packages/agents/comment_agent/tools/run_comment_agent_api.sh
```

Endpoints:

- `GET /health`
- `POST /run`

Example:

```bash
curl -s -X POST http://127.0.0.1:8003/run \
  -H "Content-Type: application/json" \
  -d '{"cycles": 5, "limit": 1}'
```

In manual API mode, `cycles=5` and `limit=1` means the comment agent will process at most 5 items total.
