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
