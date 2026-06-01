"""DEMO_MODE: the deterministic, model-free incident replay (autosre.server.demo).

Proves the hosted-URL demo path needs no model yet still drives the real run
pipeline: every documented frame appears, the human-approval pause works, the
approved remediation is applied for real against checkout-api, and VERIFY
re-queries Dynatrace so the loop bookends (open -> confirmed-cleared).
"""

from __future__ import annotations

import asyncio

import httpx
import pytest

from autosre.server.demo import DemoRunner, demo_mode_enabled
from autosre.server.runs import IncidentRun

_DOCUMENTED = {
    "step", "tool_call", "tool_result", "approval_request",
    "approval_resolved", "agent_message", "final",
}


@pytest.mark.unit
def test_demo_mode_flag_parsing(monkeypatch):
    for on in ("1", "true", "YES", "On"):
        monkeypatch.setenv("AUTOSRE_DEMO_MODE", on)
        assert demo_mode_enabled() is True
    for off in ("", "0", "false", "no"):
        monkeypatch.setenv("AUTOSRE_DEMO_MODE", off)
        assert demo_mode_enabled() is False


async def _drive_demo(target_service: str, fault: str) -> tuple[list[str], list[dict], dict]:
    httpx.post(f"{target_service}/_admin/inject", json={"fault": fault})
    run = IncidentRun("demo-run", None, runner_factory=lambda: DemoRunner(target_service))
    await run.start()

    seen: list[str] = []
    frames: list[dict] = []
    terminal: dict | None = None

    async def consume():
        nonlocal terminal
        async for frame in run.stream():
            seen.append(frame["type"])
            frames.append(frame)
            if frame["type"] == "approval_request":
                assert run.submit_approval(frame["id"], True) is True
            if frame["type"] in ("final", "error"):
                terminal = frame
                return

    await asyncio.wait_for(consume(), timeout=20)
    return seen, frames, terminal


@pytest.mark.asyncio
async def test_demo_payment_errors_resolves_green(target_service):
    seen, frames, terminal = await _drive_demo(target_service, "payment_errors")

    assert _DOCUMENTED <= set(seen)
    # Dynatrace bookends the loop: query_problems is called in DETECT and again in VERIFY.
    qp_calls = [f for f in frames if f["type"] == "tool_call" and f["name"] == "query_problems"]
    assert len(qp_calls) == 2

    ar = next(f for f in frames if f["type"] == "approval_request")
    assert ar["tool"] == "toggle_feature_flag"
    assert ar["args"] == {"name": "new_payment_gateway", "enabled": False}
    # The confirmation id must be a real string: the HTTP /approval endpoint rejects
    # a null/empty confirmation_id with 422, which would stall the loop after Approve.
    assert isinstance(ar["id"], str) and ar["id"]

    assert terminal["type"] == "final"
    assert terminal["service_healthy"] is True
    assert terminal["incident_resolved"] is True
    assert terminal["outcome"] == "resolved"
    # The remediation actually landed on checkout-api (genuine recovery).
    state = httpx.get(f"{target_service}/_internal/state").json()
    assert state["healthy"] is True


@pytest.mark.asyncio
async def test_demo_latency_spike_scales_and_recovers(target_service):
    seen, frames, terminal = await _drive_demo(target_service, "latency_spike")

    ar = next(f for f in frames if f["type"] == "approval_request")
    assert ar["tool"] == "scale_service"
    assert ar["args"]["replicas"] >= 8
    assert terminal["outcome"] == "resolved"
    assert terminal["service_healthy"] is True
