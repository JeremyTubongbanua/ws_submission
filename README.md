# ws_submission

TheCopilotMarketer is a social engagement workflow for finding relevant Reddit posts, filtering them into review queues, generating lightweight draft replies, and helping a human operator approve and publish responses through a dashboard and Chrome extension, with a FastAPI `db_api` service coordinating the workflow state.

## Directory Overview

- `packages/db_api`: FastAPI backend for ingest, queue views, workflow transitions, and extension status updates
- `packages/dashboard`: Next.js dashboard for reviewing queues and controlling agents
- `packages/scraper_daemon`: Reddit scraping service
- `packages/agents`: filter, comment, and triage agent services
- `packages/chrome_extension`: Chrome extension for loading ready-to-publish items and filling comment boxes
- `docs`: supporting docs such as ports, Docker deployment, and planning notes
- `tools/run_all.sh`: local script that starts the main services together

## How To Run Everything

Install `uv`, Node.js, and the package dependencies first. Then from the repo root run:

```bash
./tools/run_all.sh
```

That starts:

- dashboard: `http://127.0.0.1:3000`
- db_api: `http://127.0.0.1:8000`
- scraper daemon API: `http://127.0.0.1:8001`
- filter agent API: `http://127.0.0.1:8002`
- comment agent API: `http://127.0.0.1:8003`

## Chrome Extension Install

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select `packages/chrome_extension`

After loading it, open the side panel, paste the Password, and load the ready queue.

## CI/CD Overview

- `.github/workflows/ci.yml`: runs basic CI on pushes to `main` and pull requests, including Python syntax/static analysis and dashboard TypeScript/build checks
- `.github/workflows/docker-delivery.yml`: builds and pushes Docker images to Docker Hub on pushes to `main` or manual dispatch

## Demo

- Dashboard: `https://thecopilotmarketer.ca`
- DB API: `https://api.thecopilotmarketer.ca`

## BOM

- ChatGPT Tokens: `$10.00`
- ChatGPT Codex: `$31.64`
- DigitalOcean 2 GB VPS: `$10.31`
- GoDaddy Domain: `$18.07`
