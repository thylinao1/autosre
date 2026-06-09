"""Abuse-guard + lifecycle tests for the Mission-Control backend.

Covers the public-demo hardening: the per-client token-bucket rate limiter, the
single-active-run guard that bounds Vertex token burn, and the demo-control lock
that stops a second tab from corrupting a live run's fault state.
"""

from __future__ import annotations

import asyncio

import httpx
import pytest
from google.adk.events import Event
from google.genai import types


# ── rate limiter (deterministic unit) ────────────────────────────────────────


def test_rate_limiter_allows_burst_then_blocks():
    from autosre.server.app import _RateLimiter

    rl = _RateLimiter(rate_per_min=6, burst=3)
    assert [rl.allow("ip-1") for _ in range(3)] == [True, True, True]
    assert rl.allow("ip-1") is False  # burst exhausted
    assert rl.allow("ip-2") is True  # other client unaffected


# ── single-active-run + demo-control guard ───────────────────────────────────


class _PausingSession:
    id = "pause-session"


class _PausingSessionService:
    async def create_session(self, *, app_name, user_id):
        return _PausingSession()


class _PausingRunner:
    """Detect → propose, then sit at the approval gate (stays non-terminal)."""

    def __init__(self, *_a, **_k) -> None:
        self.session_service = _PausingSessionService()
        self._turn = 0

    async def run_async(self, *, user_id, session_id, new_message):
        self._turn += 1
        if self._turn != 1:
            return
        yield Event(author="autosre", content=types.Content(
            role="model", parts=[types.Part(function_call=types.FunctionCall(
                id="adk-pause-1", name="adk_request_confirmation",
                args={"originalFunctionCall": {"name": "toggle_feature_flag",
                      "args": {"name": "new_payment_gateway", "enabled": False}},
                      "toolConfirmation": {"hint": "Disable the flag."}}))]),
            long_running_tool_ids=["adk-pause-1"])


@pytest.mark.asyncio
async def test_active_run_blocks_demo_inject_then_clears(target_service):
    from autosre.server.app import app, registry

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        run = await registry.create(prompt=None, runner_factory=_PausingRunner)
        # Give the driver a tick to reach the approval pause (non-terminal).
        for _ in range(50):
            if run.has_pending_approval:
                break
            await asyncio.sleep(0.02)
        assert registry.has_active_run() is True

        blocked = await client.post("/api/demo/reset")
        assert blocked.status_code == 409  # a run is in progress

        # Resolve the gate (reject) → run goes terminal → demo controls free again.
        assert run.submit_approval("adk-pause-1", False) is True
        for _ in range(50):
            if run.is_terminal:
                break
            await asyncio.sleep(0.02)
        assert registry.has_active_run() is False
        ok = await client.post("/api/demo/reset")
        assert ok.status_code == 200


# ── graduated autonomy (risk policy) ─────────────────────────────────────────


def test_extract_pending_adds_risk_and_normalizes_string_bool():
    from google.genai import types

    from autosre.server.loop import _extract_pending

    fc = types.FunctionCall(
        id="fc-x", name="adk_request_confirmation",
        args={
            "originalFunctionCall": {
                "name": "toggle_feature_flag",
                "args": {"name": "new_payment_gateway", "enabled": "false"},
            },
            "toolConfirmation": {"hint": "raw"},
        },
    )
    p = _extract_pending(fc)
    assert p["args"]["enabled"] is False  # string "false" canonicalized to a real bool
    assert p["risk"]["tier"] == "low"  # disabling a flag is low risk
    assert p["hint"].startswith("Disable")


@pytest.mark.asyncio
async def test_second_opinion_disabled_by_default(monkeypatch):
    from autosre.agent import verifier

    monkeypatch.delenv("AUTOSRE_SECOND_OPINION", raising=False)
    assert verifier.enabled() is False
    # Disabled -> returns "" without any model call.
    assert await verifier.second_opinion("incident", "toggle_feature_flag", {}) == ""


def test_policy_risk_tiers():
    from autosre.server import policy

    assert policy.classify("toggle_feature_flag", {"enabled": False})["tier"] == "low"
    assert policy.classify("toggle_feature_flag", {"enabled": True})["tier"] == "medium"
    assert policy.classify("scale_service", {"replicas": 8})["tier"] == "low"
    assert policy.classify("rollback_deployment", {"version": "2.3.0"})["tier"] == "medium"
    assert policy.classify("weird_tool", {})["tier"] == "high"


def test_auto_approvable_is_gated_by_env(monkeypatch):
    from autosre.server import policy

    monkeypatch.delenv("AUTOSRE_AUTOAPPROVE_TIER", raising=False)
    assert policy.is_auto_approvable("toggle_feature_flag", {"enabled": False}) is False
    monkeypatch.setenv("AUTOSRE_AUTOAPPROVE_TIER", "low")
    assert policy.is_auto_approvable("toggle_feature_flag", {"enabled": False}) is True
    assert policy.is_auto_approvable("rollback_deployment", {"version": "2.3.0"}) is False
    monkeypatch.setenv("AUTOSRE_AUTOAPPROVE_TIER", "medium")
    assert policy.is_auto_approvable("rollback_deployment", {"version": "2.3.0"}) is True


@pytest.mark.asyncio
async def test_graduated_autoapprove_needs_no_human(target_service, monkeypatch):
    """With a pre-authorized tier, a low-risk action resolves with NO human POST."""
    monkeypatch.setenv("AUTOSRE_AUTOAPPROVE_TIER", "low")
    from autosre.server import ledger
    from autosre.server.runs import IncidentRun

    ledger.clear()
    run = IncidentRun("autoapprove-1", None, runner_factory=_PausingRunner)
    await run.start()

    terminal = None

    async def consume():
        nonlocal terminal
        async for frame in run.stream():
            # Deliberately never call submit_approval - policy must auto-approve.
            if frame["type"] in ("final", "error"):
                terminal = frame
                return

    await asyncio.wait_for(consume(), timeout=20)
    assert terminal is not None and terminal["type"] == "final"
    entry = ledger.recent(1)[0]
    assert entry["run_id"] == "autoapprove-1"
    assert entry["decision"] == "approved"
    assert entry["auto_approved"] is True
    ledger.clear()


@pytest.mark.asyncio
async def test_superseded_run_is_not_audited_as_rejection(target_service):
    """A run stood down by a newer run is a framework eviction, not an operator
    decision, so it must NOT appear in the audit ledger (and never as 'rejected')."""
    from autosre.server import ledger
    from autosre.server.runs import RunRegistry

    ledger.clear()
    reg = RunRegistry()
    first = await reg.create(prompt=None, runner_factory=_PausingRunner)
    for _ in range(50):
        if first.has_pending_approval:
            break
        await asyncio.sleep(0.02)

    # A new run supersedes the first (stands it down).
    second = await reg.create(prompt=None, runner_factory=_PausingRunner)
    for _ in range(50):
        if first.is_terminal:
            break
        await asyncio.sleep(0.02)

    assert first.is_terminal is True
    audited_run_ids = [e["run_id"] for e in ledger.recent(50)]
    assert first.run_id not in audited_run_ids  # the superseded run is not audited
    second.abandon()
    ledger.clear()


@pytest.mark.asyncio
async def test_starting_a_run_supersedes_the_previous_active_run(target_service):
    from autosre.server.runs import RunRegistry

    reg = RunRegistry()
    first = await reg.create(prompt=None, runner_factory=_PausingRunner)
    for _ in range(50):
        if first.has_pending_approval:
            break
        await asyncio.sleep(0.02)
    assert reg.has_active_run() is True

    # A new run stands the old one down - only one Gemini loop is ever live.
    second = await reg.create(prompt=None, runner_factory=_PausingRunner)
    for _ in range(50):
        if first.is_terminal:
            break
        await asyncio.sleep(0.02)
    assert first.is_terminal is True
    assert second.run_id != first.run_id
