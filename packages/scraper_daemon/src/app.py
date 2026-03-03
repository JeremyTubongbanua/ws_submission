from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, Field

from src.reddit_scraper import load_config, run_once


class RunRequest(BaseModel):
    cycles: int = Field(default=5, ge=1, le=5)
    limit: int = Field(default=1, ge=1, le=5)


config = load_config()
app = FastAPI(title="Scraper Daemon API", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/run")
def run_scraper(request: RunRequest) -> dict[str, Any]:
    results: list[dict[str, int]] = []
    for _ in range(request.cycles):
        results.append(run_once(config, max_items=request.limit))
    return {
        "agent": "scraper_daemon",
        "cycles_requested": request.cycles,
        "results": results,
    }
