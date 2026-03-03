FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy

WORKDIR /app/packages/scraper_daemon

RUN pip install --no-cache-dir uv

COPY packages/scraper_daemon /app/packages/scraper_daemon

RUN uv sync --frozen || uv sync

EXPOSE 8001

CMD ["uv", "run", "uvicorn", "src.app:app", "--host", "0.0.0.0", "--port", "8001"]
