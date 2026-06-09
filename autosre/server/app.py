"""FastAPI HTTP/SSE layer for AutoSRE - the Mission-Control backend.

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
import time

import httpx
from dotenv import load_dotenv

# Load .env BEFORE importing the agent (it reads AUTOSRE_MODEL / mode at import).
load_dotenv()

from fastapi import FastAPI, HTTPException, Query, Request  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from pydantic import BaseModel  # noqa: E402
from sse_starlette.sse import EventSourceResponse  # noqa: E402

from autosre.gcp_auth import target_headers  # noqa: E402

from . import ledger  # noqa: E402
from .demo import DemoRunner, demo_mode_enabled  # noqa: E402
from .runs import RunRegistry, _target_url  # noqa: E402

HEARTBEAT_S = 15  # SSE keep-alive comment cadence (Cloud Run idle-close guard).


# ── Abuse guard for the public, unauthenticated demo endpoints ───────────────
# The agent URL is baked into the public UI bundle, so it is discoverable. A
# token bucket per client bounds two real risks: looping /api/incident/start to
# burn Vertex tokens, and spamming /api/demo/* to corrupt the single shared
# target. A shared secret in the public bundle would be theater; this is real.
class _RateLimiter:
    def __init__(self, rate_per_min: float, burst: int) -> None:
        self._rate = rate_per_min / 60.0
        self._burst = float(burst)
        self._buckets: dict[str, tuple[float, float]] = {}

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        tokens, last = self._buckets.get(key, (self._burst, now))
        tokens = min(self._burst, tokens + (now - last) * self._rate)
        if tokens < 1.0:
            self._buckets[key] = (tokens, now)
            return False
        self._buckets[key] = (tokens - 1.0, now)
        return True


_start_limiter = _RateLimiter(rate_per_min=6, burst=3)
_demo_limiter = _RateLimiter(rate_per_min=20, burst=6)


def _client_key(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for", "")
    first = xff.split(",")[0].strip()
    return first or (request.client.host if request.client else "anon")

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
        base = _target_url()
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{base}{path}", json=payload, headers=target_headers(base)
            )
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"target service unreachable: {exc.__class__.__name__}")


async def _target_get(path: str) -> dict:
    try:
        base = _target_url()
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{base}{path}", headers=target_headers(base))
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"target service unreachable: {exc.__class__.__name__}")


# ── 1. incident endpoints ────────────────────────────────────────────────────
@app.post("/api/incident/start")
async def incident_start(body: StartRequest, request: Request):
    if not _start_limiter.allow(_client_key(request)):
        raise HTTPException(429, "rate limited: too many incident starts, slow down")
    if body.inject:
        # Inject a real fault before the agent runs, so it detects a real problem.
        await _target_post("/_admin/inject", {"fault": body.inject})
    # DEMO_MODE: drive the run with the deterministic, model-free DemoRunner so the
    # hosted URL never stalls on a free-tier model blip. The remediation still runs
    # for real, so recovery (and the green card) is genuine. Same frames either way.
    factory = (lambda: DemoRunner(_target_url())) if demo_mode_enabled() else None
    run = await registry.create(body.prompt, runner_factory=factory)
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
async def demo_inject(body: InjectRequest, request: Request):
    if not _demo_limiter.allow(_client_key(request)):
        raise HTTPException(429, "rate limited: too many demo-control calls")
    if registry.has_active_run():
        # Don't let a second tab corrupt the fault a live run is mid-diagnosing.
        raise HTTPException(409, "a run is in progress; reset is blocked until it ends")
    return await _target_post("/_admin/inject", {"fault": body.fault})


@app.post("/api/demo/reset")
async def demo_reset(request: Request):
    if not _demo_limiter.allow(_client_key(request)):
        raise HTTPException(429, "rate limited: too many demo-control calls")
    if registry.has_active_run():
        raise HTTPException(409, "a run is in progress; reset is blocked until it ends")
    return await _target_post("/_admin/inject", {"fault": "clear"})


@app.get("/api/demo/health")
async def demo_health():
    return await _target_get("/_internal/state")


# ── 5. approval ledger (the audit trail) ─────────────────────────────────────
@app.get("/api/ledger")
async def get_ledger(limit: int = Query(default=25, ge=1, le=1000)):
    """Append-only audit record of every sweep: incident, action, decision, outcome.

    `dynatrace_writeback` reflects whether each approval is also written back to
    the Dynatrace tenant as an OTLP log (true only when OTLP creds are configured).
    """
    return {
        "entries": ledger.recent(limit),
        "dynatrace_writeback": ledger.export_enabled(),
        # `dynatrace_writeback` = creds configured; `last_writeback` = did the most
        # recent write actually land (and verify queryable). They are different.
        "last_writeback": ledger.last_writeback(),
    }


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}
