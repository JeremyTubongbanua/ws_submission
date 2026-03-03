FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy

WORKDIR /app/packages/db_api

RUN pip install --no-cache-dir uv

COPY packages/db_api /app/packages/db_api

RUN uv sync --frozen || uv sync

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "src.app:app", "--host", "0.0.0.0", "--port", "8000"]
