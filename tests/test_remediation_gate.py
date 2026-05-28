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
