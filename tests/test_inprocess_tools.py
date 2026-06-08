"""Tests for the in-process Dynatrace toolset (the Agent Engine path).

These plain-function tools must mirror the mock MCP surface's shapes so the agent
instruction and UI behave identically, and must never leak the answer key.
"""

from __future__ import annotations

import httpx
import pytest

from autosre.agent import inprocess_tools as T


@pytest.fixture(autouse=True)
def _point_at_target(target_service, monkeypatch):
    monkeypatch.setenv("TARGET_SERVICE_URL", target_service)


def test_query_problems_payment_is_davis_shaped(target_service):
    httpx.post(f"{target_service}/_admin/inject", json={"fault": "payment_errors"})
    p = T.query_problems()
    assert p["total"] == 1
    prob = p["problems"][0]
    assert prob["severity"] == "AVAILABILITY"
    assert prob["impacted_metric"] == "failure_rate"
    assert "blast_radius" in prob and prob["blast_radius"]["failing_per_min"] > 0
    # never leak the answer key
    assert "root_cause" not in prob and "correct_fix" not in prob


def test_query_problems_latency_is_performance(target_service):
    httpx.post(f"{target_service}/_admin/inject", json={"fault": "latency_spike"})
    prob = T.query_problems()["problems"][0]
    assert prob["severity"] == "PERFORMANCE"
    assert prob["impacted_metric"] == "p99_latency_ms"


def test_query_problems_all_clear(target_service):
    httpx.post(f"{target_service}/_admin/inject", json={"fault": "clear"})
    assert T.query_problems()["total"] == 0


def test_execute_dql_intent_matching(target_service):
    httpx.post(f"{target_service}/_admin/inject", json={"fault": "payment_errors"})
    assert T.execute_dql("fetch events deployment")["records"][0]["version"] == "2.3.1"
    assert T.execute_dql("failure rate")["records"][0]["metric"] == "failure_rate"
    assert T.execute_dql("cpu saturation")["records"][0]["metric"] == "cpu_utilization"


def test_events_surface_oom_for_memory_leak(target_service):
    httpx.post(f"{target_service}/_admin/inject", json={"fault": "memory_leak"})
    reasons = [e["reason"] for e in T.get_events_for_kubernetes_cluster()["events"]]
    assert "OOMKilled" in reasons


def test_inprocess_tools_list_shape():
    tools = T.inprocess_tools()
    names = {f.__name__ for f in tools}
    assert names == {"query_problems", "execute_dql",
                     "get_events_for_kubernetes_cluster", "get_vulnerabilities"}
