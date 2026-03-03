FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy

WORKDIR /app/packages/agents/comment_agent

RUN pip install --no-cache-dir uv

COPY packages/agents /app/packages/agents
COPY packages/db_api/.env /app/packages/db_api/.env

WORKDIR /app/packages/agents
RUN uv sync --frozen || uv sync

WORKDIR /app/packages/agents/comment_agent

EXPOSE 8003

CMD ["uv", "run", "uvicorn", "src.app:app", "--host", "0.0.0.0", "--port", "8003"]
