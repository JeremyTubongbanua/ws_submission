from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, Field

from src.main import cycle_factory


class RunRequest(BaseModel):
    cycles: int = Field(default=5, ge=1, le=5)
    limit: int = Field(default=10, ge=1, le=100)


runtime_config, cycle = cycle_factory()
app = FastAPI(title="Filter Agent API", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/run")
def run_agent(request: RunRequest) -> dict[str, Any]:
    results: list[dict[str, Any] | None] = []
    for _ in range(request.cycles):
        results.append(cycle(limit=request.limit))
    return {
        "agent": "filter_agent",
        "cycles_requested": request.cycles,
        "results": results,
    }
