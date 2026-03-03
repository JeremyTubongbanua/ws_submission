# Filter Agent

## Purpose

The filter agent reads newly ingested content and decides whether it is worth moving into human opportunity review or trashing.

This is the first AI decision point after scraping.

## Position in workflow

- input state: `ingested`
- output state: `opportunity_review` or `trashed`

## Responsibilities

- evaluate whether the content is relevant to Wealthsimple or adjacent user intent
- identify high-intent discussions such as broker comparisons, frustrations, product questions, transfer questions, investing behavior, or onboarding friction
- reject low-signal, off-topic, meme-only, spammy, or unsafe content
- return structured reasoning and confidence

## Expected inputs

From the DB API queue item:

- source
- source URL
- title
- body text
- subreddit or source metadata
- sampled comments from `raw_payload.top_level_comments`
- engagement metadata such as score and comment count

## Expected outputs

The agent should produce a structured decision like:

```json
{
  "decision": "move_to_opportunity_review",
  "confidence": 0.91,
  "reason": "The user is comparing brokerages and discussing platform tradeoffs.",
  "tags": ["broker-comparison", "high-intent", "wealthsimple-adjacent"]
}
```

## API endpoints this agent should use

- `GET /v1/queues/ingested`
- `POST /v1/queues/ingested/{content_id}/classify`

## Non-goals

- generating replies
- giving personal financial advice
- directly writing to Supabase

## Prompting guidance

The filter agent should be conservative about:

- regulatory topics
- individualized investing recommendations
- content with weak relevance

It should prefer moving clear opportunities forward and trashing low-value content.

## Future implementation notes

Suggested files when implemented:

- `src/main.py`
- `src/client.py`
- `src/prompt.md`
- `src/models.py`
- `src/eval_cases.json`
