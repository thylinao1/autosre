"""Verify remediation tools resolve incidents, and that the mutating tools are
declared as requiring human approval (ADK-native HITL)."""

from __future__ import annotations

import httpx

from google.adk.tools import FunctionTool

from autosre.agent import agent as A
from autosre.agent import remediation as R


def test_mutating_tools_require_confirmation():
    """All three mutating actions must be gated behind human approval."""
    by_name = {}
    for t in A.root_agent.tools:
        if isinstance(t, FunctionTool):
            by_name[t.name] = t
    for name in ("scale_service", "rollback_deployment", "toggle_feature_flag"):
        assert name in by_name, f"{name} not registered as a FunctionTool"
        assert by_name[name]._require_confirmation is True, \
            f"{name} must require human confirmation"


def test_correct_remediation_resolves_payment_incident(target_service):
    httpx.post(f"{target_service}/_admin/inject", json={"fault": "payment_errors"})
    res = R.toggle_feature_flag("new_payment_gateway", False)
    assert res["resolved_incident"] is True
    assert res["service_healthy"] is True


def test_scaling_resolves_latency_incident(target_service):
    httpx.post(f"{target_service}/_admin/inject", json={"fault": "latency_spike"})
    res = R.scale_service(8)
    assert res["resolved_incident"] is True
    assert res["service_healthy"] is True


def test_wrong_remediation_does_not_resolve(target_service):
    httpx.post(f"{target_service}/_admin/inject", json={"fault": "payment_errors"})
    res = R.scale_service(8)  # scaling doesn't fix a feature-flag bug
    assert res["resolved_incident"] is False
    assert res["service_healthy"] is False


def test_get_service_health_reads_live_state(target_service):
    httpx.post(f"{target_service}/_admin/inject", json={"fault": "payment_errors"})
    health = R.get_service_health()
    assert health["healthy"] is False
    assert health["injected_fault"] == "payment_errors"


# ── action envelope (defense-in-depth bounds) ────────────────────────────────


def test_get_service_health_does_not_leak_the_answer_key(target_service):
    """The agent-facing state must never carry root_cause / correct_fix / alt_fix."""
    httpx.post(f"{target_service}/_admin/inject", json={"fault": "payment_errors"})
    health = R.get_service_health()
    detail = health.get("active_fault_detail", {})
    assert "root_cause" not in detail
    assert "correct_fix" not in detail
    assert "alt_fix" not in detail
    assert "precondition" not in detail
    # The observable symptom (a Davis-style title + impacted metric) is still there.
    assert detail.get("metric") == "failure_rate"
    # The full answer key lives only on the test-only route, never via the agent tool.
    key = httpx.get(f"{target_service}/_internal/answer_key", timeout=5).json()
    assert key["correct_fix"]["action"] == "toggle_feature_flag"


def test_scale_service_rejects_out_of_band_replicas(target_service):
    httpx.post(f"{target_service}/_admin/inject", json={"fault": "latency_spike"})
    res = R.scale_service(0)  # below the floor — a poisoned "scale to nothing"
    assert res.get("blocked") is True
    assert res["resolved_incident"] is False
    # And the fault is untouched: the bound fired before any mutation.
    state = httpx.get(f"{target_service}/_internal/state").json()
    assert state["healthy"] is False


def test_rollback_rejects_unknown_version(target_service):
    httpx.post(f"{target_service}/_admin/inject", json={"fault": "payment_errors"})
    res = R.rollback_deployment("0.0.0-evil")  # not in the known-good allow-list
    assert res.get("blocked") is True


def test_toggle_rejects_unknown_flag_and_coerces_string_bool(target_service):
    httpx.post(f"{target_service}/_admin/inject", json={"fault": "payment_errors"})
    blocked = R.toggle_feature_flag("some_other_flag", False)
    assert blocked.get("blocked") is True
    # Managed flag + string "false" (Gemini may emit a string) resolves correctly.
    ok = R.toggle_feature_flag("new_payment_gateway", "false")
    assert ok["resolved_incident"] is True
    assert ok["service_healthy"] is True


# ── decoy incidents: the obvious reflex must NOT resolve them ─────────────────


def test_dependency_rollback_decoy(target_service):
    """Failure-rate spike with the flag already OFF: toggling is a no-op; rollback fixes it."""
    httpx.post(f"{target_service}/_admin/inject", json={"fault": "dependency_rollback"})
    # Reflex: disable the flag (already off) — must NOT resolve.
    toggled = R.toggle_feature_flag("new_payment_gateway", False)
    assert toggled["resolved_incident"] is False
    # Correct: roll back the bad deploy.
    rolled = R.rollback_deployment("2.3.0")
    assert rolled["resolved_incident"] is True
    assert rolled["service_healthy"] is True


def test_memory_leak_decoy(target_service):
    """High p99 but CPU normal + OOMKilled: scaling is a no-op; rollback fixes it."""
    httpx.post(f"{target_service}/_admin/inject", json={"fault": "memory_leak"})
    scaled = R.scale_service(10)  # reflex: scale — must NOT resolve a leak
    assert scaled["resolved_incident"] is False
    rolled = R.rollback_deployment("2.3.0")
    assert rolled["resolved_incident"] is True
    assert rolled["service_healthy"] is True
