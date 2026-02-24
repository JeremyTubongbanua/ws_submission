# API Requirements

Captured from user request:

- "An easy to use endpoint for the Scraper Daemon to insert a new content piece. API should automatically create a transaction upon that."
- "Scraper Subagent should be able to read the ingested, then decide whether that should either move onto opportunity review"
- "Comment Subagent should be able to read the drafting queue, add a generated comment, then APi will move it into the For Human Review. API creates transaciton automatically"
- "Frontend Triage Dashboard should be able to view data on the ingested, opportunity review, drafting queue, approval review, and ready to publish views"
- "Chrome extension needs access to ready to publish view, then also notify the API once the post has been complete or deleted"

Implementation mapping:

- Scraper daemon: `POST /v1/content/ingest` inserts `content`, `content_state`, and logs `transactions.action='ingested'`.
- Scraper subagent: `GET /v1/queues/ingested` + `POST /v1/queues/ingested/{content_id}/classify` to move to `opportunity_review` or trash, logging transactions automatically.
- Comment subagent: `GET /v1/queues/drafting` + `POST /v1/queues/drafting/{content_id}/generate-comment` to create comment and move to `approval_review`, logging transactions automatically.
- Frontend dashboard: `GET /v1/views/{view_name}` for `ingested`, `opportunity_review`, `drafting_queue`, `approval_review`, `ready_to_publish`.
- Chrome extension: `GET /v1/queues/ready-to-publish` + `POST /v1/extension/tasks/{content_id}/status` with `submitted` or `deleted`, logging transactions automatically.

## cURL Examples

Set these once in your shell:

```bash
export API_BASE="http://127.0.0.1:8000"
export API_KEY="your_db_api_service_token"
```

Health check:

```bash
curl -s "$API_BASE/health"
```

Ingest content (Scraper Daemon):

```bash
curl -s -X POST "$API_BASE/v1/content/ingest" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "source": "reddit",
    "source_content_id": "t3_demo_1001",
    "source_url": "https://reddit.com/r/saas/comments/demo_1001",
    "source_author": "founder_1",
    "title": "Need help improving onboarding",
    "body_text": "Trying to increase activation rate.",
    "raw_payload": {"subreddit": "saas", "score": 33},
    "actor": "system",
    "actor_label": "scraper-daemon"
  }'
```

Read ingested queue (Scraper Subagent):

```bash
curl -s "$API_BASE/v1/queues/ingested?limit=25&offset=0" \
  -H "X-API-Key: $API_KEY"
```

Classify ingested -> opportunity review:

```bash
curl -s -X POST "$API_BASE/v1/queues/ingested/<CONTENT_ID>/classify" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "decision": "move_to_opportunity_review",
    "actor": "agent",
    "actor_label": "scraper-subagent",
    "details": {"confidence": 0.91, "reason": "high-intent-post"}
  }'
```

Classify ingested -> trash:

```bash
curl -s -X POST "$API_BASE/v1/queues/ingested/<CONTENT_ID>/classify" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "decision": "trash",
    "reason": "not_relevant",
    "actor": "agent",
    "actor_label": "scraper-subagent"
  }'
```

Read drafting queue (Comment Subagent):

```bash
curl -s "$API_BASE/v1/queues/drafting?limit=25&offset=0" \
  -H "X-API-Key: $API_KEY"
```

Generate comment and auto-move to approval review:

```bash
curl -s -X POST "$API_BASE/v1/queues/drafting/<CONTENT_ID>/generate-comment" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "draft_text": "Great question. Which onboarding step has the highest drop-off right now?",
    "model_name": "gpt-5-mini",
    "model_temperature": 0.4,
    "prompt_version": "v1",
    "safety_flags": {"toxicity": false},
    "is_selected": true,
    "actor": "agent",
    "actor_label": "comment-subagent"
  }'
```

Read dashboard views:

```bash
curl -s "$API_BASE/v1/views/ingested?limit=50&offset=0" -H "X-API-Key: $API_KEY"
curl -s "$API_BASE/v1/views/opportunity_review?limit=50&offset=0" -H "X-API-Key: $API_KEY"
curl -s "$API_BASE/v1/views/drafting_queue?limit=50&offset=0" -H "X-API-Key: $API_KEY"
curl -s "$API_BASE/v1/views/approval_review?limit=50&offset=0" -H "X-API-Key: $API_KEY"
curl -s "$API_BASE/v1/views/ready_to_publish?limit=50&offset=0" -H "X-API-Key: $API_KEY"
```

Read ready-to-publish queue (Chrome Extension):

```bash
curl -s "$API_BASE/v1/queues/ready-to-publish?limit=25&offset=0" \
  -H "X-API-Key: $API_KEY"
```

Extension status -> submitted:

```bash
curl -s -X POST "$API_BASE/v1/extension/tasks/<CONTENT_ID>/status" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "status": "submitted",
    "generated_comment_id": "<GENERATED_COMMENT_UUID>",
    "actor": "user",
    "actor_label": "chrome-extension"
  }'
```

Extension status -> deleted:

```bash
curl -s -X POST "$API_BASE/v1/extension/tasks/<CONTENT_ID>/status" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "status": "deleted",
    "generated_comment_id": "<GENERATED_COMMENT_UUID>",
    "error_message": "user_deleted_before_submit",
    "actor": "user",
    "actor_label": "chrome-extension"
  }'
```
