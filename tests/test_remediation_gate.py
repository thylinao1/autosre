"""Verify the human-in-the-loop gate and that remediations resolve incidents."""

from __future__ import annotations

import httpx
import pytest

from autosre.agent import remediation as R


class _FakeTool:
    def __init__(self, name):
        self.name = name


@pytest.fixture(autouse=True)
def _reset_gate():
    R.APPROVAL_GATE.update({"approved": False, "plan": None})
    yield


def test_gate_blocks_mutating_tool_without_approval():
    out = R.approval_gate_callback(_FakeTool("scale_service"), {"replicas": 8}, None)
    assert out["status"] == "BLOCKED"


def test_gate_allows_after_approval_and_consumes_it():
    R.APPROVAL_GATE["approved"] = True
    assert R.approval_gate_callback(_FakeTool("scale_service"), {}, None) is None
    # single-use: a second action is blocked again
    assert R.APPROVAL_GATE["approved"] is False
    assert R.approval_gate_callback(_FakeTool("scale_service"), {}, None)["status"] == "BLOCKED"


def test_gate_never_blocks_read_tools():
    assert R.approval_gate_callback(_FakeTool("list_problems"), {}, None) is None
    assert R.approval_gate_callback(_FakeTool("propose_remediation"), {}, None) is None


def test_propose_records_plan_without_executing(target_service):
    httpx.post(f"{target_service}/_admin/inject", json={"fault": "payment_errors"})
    out = R.propose_remediation(
        summary="payment errors", action="toggle_feature_flag",
        args={"name": "new_payment_gateway", "enabled": False},
        rationale="disable the broken gateway flag")
    assert out["status"] == "AWAITING_HUMAN_APPROVAL"
    # service is still unhealthy — nothing was executed
    assert httpx.get(f"{target_service}/_internal/state").json()["healthy"] is False


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
