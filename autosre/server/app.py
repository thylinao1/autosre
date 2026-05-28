"""FastAPI HTTP/SSE layer for AutoSRE — the Mission-Control backend.

Implements the six endpoints of CONTRACT.md §1 as a thin transport over the
shared ADK loop (`autosre.server.loop` / `runs`). The agent remains the only
planner; this module just starts runs, streams typed SSE frames, accepts the
human approval decision, and proxies the demo-control surface to checkout-api.

Run:
    python -m autosre.server                 # uvicorn on PORT (default 8080)
    uvicorn autosre.server.app:app --port 8080
"""

from __future__ import annotations

import asyncio
import json
import os

import httpx
from dotenv import load_dotenv

# Load .env BEFORE importing the agent (it reads AUTOSRE_MODEL / mode at import).
load_dotenv()

from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from pydantic import BaseModel  # noqa: E402
from sse_starlette.sse import EventSourceResponse  # noqa: E402

from .runs import RunRegistry, _target_url  # noqa: E402

HEARTBEAT_S = 15  # SSE keep-alive comment cadence (Cloud Run idle-close guard).

app = FastAPI(title="autosre-mission-control", version="1.0.0")

_allowed = os.environ.get("ALLOWED_ORIGIN", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[_allowed] if _allowed != "*" else ["*"],
    allow_credentials=_allowed != "*",
    allow_methods=["*"],
    allow_headers=["*"],
)

registry = RunRegistry()


# ── request/response models ──────────────────────────────────────────────────
class StartRequest(BaseModel):
    inject: str | None = None
    prompt: str | None = None


class ApprovalRequest(BaseModel):
    confirmation_id: str
    approved: bool


class InjectRequest(BaseModel):
    fault: str


# ── target-service proxy helpers ─────────────────────────────────────────────
async def _target_post(path: str, payload: dict) -> dict:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(f"{_target_url()}{path}", json=payload)
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"target service unreachable: {exc.__class__.__name__}")


async def _target_get(path: str) -> dict:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{_target_url()}{path}")
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"target service unreachable: {exc.__class__.__name__}")


# ── 1. incident endpoints ────────────────────────────────────────────────────
@app.post("/api/incident/start")
async def incident_start(body: StartRequest):
    if body.inject:
        # Inject a real fault before the agent runs, so it detects a real problem.
        await _target_post("/_admin/inject", {"fault": body.inject})
    run = await registry.create(body.prompt)
    return {"run_id": run.run_id, "status": "started"}


@app.get("/api/incident/{run_id}/stream")
async def incident_stream(run_id: str):
    run = registry.get(run_id)
    if run is None:
        raise HTTPException(404, "unknown run_id")

    async def event_publisher():
        frame_iter = run.stream().__aiter__()
        while True:
            try:
                frame = await asyncio.wait_for(frame_iter.__anext__(), timeout=HEARTBEAT_S)
            except asyncio.TimeoutError:
                yield {"comment": "ping"}  # SSE heartbeat to keep proxies open.
                continue
            except StopAsyncIteration:
                yield {"comment": "done"}
                return
            yield {"event": frame["type"], "data": json.dumps(frame)}

    return EventSourceResponse(event_publisher())


@app.post("/api/incident/{run_id}/approval")
async def incident_approval(run_id: str, body: ApprovalRequest):
    run = registry.get(run_id)
    if run is None:
        raise HTTPException(404, "unknown run_id")
    if not run.submit_approval(body.confirmation_id, body.approved):
        # No pending request, or a mismatched/stale confirmation_id.
        raise HTTPException(409, "no matching pending approval for this confirmation_id")
    return {
        "status": "accepted",
        "confirmation_id": body.confirmation_id,
        "approved": body.approved,
    }


# ── 4. demo-control endpoints (proxy checkout-api admin surface) ─────────────
@app.post("/api/demo/inject")
async def demo_inject(body: InjectRequest):
    return await _target_post("/_admin/inject", {"fault": body.fault})


@app.post("/api/demo/reset")
async def demo_reset():
    return await _target_post("/_admin/inject", {"fault": "clear"})


@app.get("/api/demo/health")
async def demo_health():
    return await _target_get("/_internal/state")


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}
