# Docker Deployment

This project can be run with the root [docker-compose.yml](/Users/jeremytubongbanua/GitHub/ws_submission/docker-compose.yml).

## Networking model

There are two separate networking layers:

1. Docker internal network
2. Host machine ports exposed to nginx

Inside Docker, services talk to each other by service name:

- dashboard -> `http://db_api:8000`
- dashboard -> `http://scraper_daemon:8001`
- dashboard -> `http://filter_agent:8002`
- dashboard -> `http://comment_agent:8003`
- scraper/agents -> `http://db_api:8000`

Outside Docker, nginx runs on the VPS host and talks to published host ports:

- host `127.0.0.1:3000` -> dashboard container
- host `127.0.0.1:8000` -> db_api container

That means nginx should continue proxying to:

- `127.0.0.1:3000` for `thecopilotmarketer.ca`
- `127.0.0.1:8000` for `api.thecopilotmarketer.ca`

nginx should not proxy to Docker service names like `dashboard` or `db_api`, because nginx is running on the host, not inside the Docker network.

## Exposed ports

The compose file publishes:

- `3000:3000` dashboard
- `8000:8000` db_api
- `8001:8001` scraper daemon API
- `8002:8002` filter agent API
- `8003:8003` comment agent API

For your current nginx setup, only these need public DNS/proxying:

- `3000`
- `8000`

The agent ports are still published for direct debugging, but nginx does not need to expose them publicly.

## Start commands

From the repo root:

```bash
docker compose build
docker compose up -d
```

Check:

```bash
docker compose ps
docker compose logs -f db_api
docker compose logs -f dashboard
```

## nginx expectations

Your nginx config should still reverse proxy to the host ports:

```nginx
proxy_pass http://127.0.0.1:3000;
proxy_pass http://127.0.0.1:8000;
```

No nginx change is required just because the apps are in Docker, as long as those ports stay published on the host.
