#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")"/.. >/dev/null 2>&1 && pwd)"
LOG_DIR="$ROOT_DIR/.logs"
mkdir -p "$LOG_DIR"

PIDS=()

start_service() {
  local name="$1"
  local workdir="$2"
  local log_file="$3"
  shift 3

  echo "Starting $name..."
  (
    cd "$workdir"
    "$@"
  ) >"$log_file" 2>&1 &

  local pid=$!
  PIDS+=("$pid")
  echo "  pid=$pid log=$log_file"
}

cleanup() {
  echo
  echo "Stopping services..."
  for pid in "${PIDS[@]:-}"; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
    fi
  done
}

trap cleanup EXIT INT TERM

start_service \
  "db_api" \
  "$ROOT_DIR/packages/db_api" \
  "$LOG_DIR/db_api.log" \
  uv run uvicorn src.app:app --reload --port 8000

start_service \
  "scraper_daemon_api" \
  "$ROOT_DIR/packages/scraper_daemon" \
  "$LOG_DIR/scraper_daemon_api.log" \
  uv run uvicorn src.app:app --reload --port 8001

start_service \
  "filter_agent_api" \
  "$ROOT_DIR/packages/agents/filter_agent" \
  "$LOG_DIR/filter_agent_api.log" \
  uv run uvicorn src.app:app --reload --port 8002

start_service \
  "comment_agent_api" \
  "$ROOT_DIR/packages/agents/comment_agent" \
  "$LOG_DIR/comment_agent_api.log" \
  uv run uvicorn src.app:app --reload --port 8003

start_service \
  "dashboard" \
  "$ROOT_DIR/packages/dashboard" \
  "$LOG_DIR/dashboard.log" \
  npm run dev

cat <<EOF

All services started.

Ports:
  frontend:            http://127.0.0.1:3000
  db_api:              http://127.0.0.1:8000
  scraper_daemon_api:  http://127.0.0.1:8001
  filter_agent_api:    http://127.0.0.1:8002
  comment_agent_api:   http://127.0.0.1:8003

Logs:
  $LOG_DIR/db_api.log
  $LOG_DIR/scraper_daemon_api.log
  $LOG_DIR/filter_agent_api.log
  $LOG_DIR/comment_agent_api.log
  $LOG_DIR/dashboard.log

Press Ctrl+C to stop everything.
EOF

wait
