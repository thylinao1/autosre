"""In-process Dynatrace observability tools (no MCP, no subprocess).

A self-contained variant of the bundled mock Dynatrace surface, exposed as plain
Python functions instead of an MCP stdio server. This exists for ONE reason:
Vertex AI Agent Engine's managed runtime cannot spawn the MCP stdio subprocess
(`python -m autosre.mock_dynatrace.server`), and the hosted remote MCP gateway is
a curated Davis/entity toolset with no `execute_dql`, so neither MCP path runs the
DQL-first AutoSRE loop on an OTel-only tenant. With DYNATRACE_MCP_MODE=inprocess
the agent gets the same observability tools directly, so it deploys and runs
end-to-end on Agent Engine.

The live demo and the real-tenant credibility cut still use the real MCP
transport (mock stdio / official server). This module mirrors that surface's tool
names and response shapes so the agent instruction and the UI behave identically;
it is intentionally a small, isolated duplicate of mock_dynatrace/server.py so a
change here can never affect the MCP demo path.
"""

from __future__ import annotations

import os

import httpx

from autosre.gcp_auth import target_headers


def _target() -> str:
    return os.environ.get("TARGET_SERVICE_URL", "http://localhost:8081")


def _state() -> dict:
    base = _target()
    try:
        return httpx.get(
            f"{base}/_internal/state", timeout=10.0, headers=target_headers(base)
        ).json()
    except Exception as exc:  # noqa: BLE001 - surface as a tool-visible message
        return {"error": f"could not reach checkout-api at {base}: {exc}"}


def query_problems(status: str = "OPEN") -> dict:
    """Query active Davis problems (open incidents) detected in the environment."""
    st = _state()
    if st.get("error"):
        return {"problems": [], "note": st["error"]}
    problems = []
    if not st.get("healthy", True):
        d = st["active_fault_detail"]
        m = st["metrics"]
        metric = d["metric"]
        rpm = m.get("requests_per_min", 0)
        if metric == "failure_rate":
            failing = round(rpm * (m.get("failure_rate", 0) / 100.0))
            blast_radius = {
                "requests_per_min": rpm,
                "failing_per_min": failing,
                "downstream_services": 2,
                "summary": f"~{failing} of {rpm} checkouts/min failing; payment + order paths impacted",
            }
            root_cause_entity = f"SERVICE checkout-api · deploy v{st['version']} · flag new_payment_gateway"
        else:
            blast_radius = {
                "requests_per_min": rpm,
                "downstream_services": 2,
                "summary": f"all {rpm} checkouts/min degraded; cart + order paths impacted",
            }
            root_cause_entity = f"SERVICE checkout-api · {st.get('replicas', 3)} replicas saturated"
        problems.append({
            "problemId": "P-2026-0042",
            "title": d["summary"],
            "severity": "AVAILABILITY" if metric == "failure_rate" else "PERFORMANCE",
            "status": "OPEN",
            "affected_entity": "checkout-api",
            "root_cause_entity": root_cause_entity,
            "affected_entities": ["checkout-api", "payment-gateway", "order-service"],
            "impacted_metric": metric,
            "observed_value": m.get(metric),
            "deploy_version": st["version"],
            "active_feature_flags": st["feature_flags"],
            "blast_radius": blast_radius,
        })
    return {"problems": problems, "total": len(problems)}


def execute_dql(dqlQueryString: str) -> dict:
    """Execute a Dynatrace Query Language (DQL) statement and return result rows."""
    st = _state()
    if st.get("error"):
        return {"records": [], "note": st["error"]}
    m = st["metrics"]
    q = dqlQueryString.lower()
    if "deploy" in q or "version" in q or "event" in q:
        records = [{"timestamp": "2026-05-28T11:58:00Z", "event": "DEPLOYMENT",
                    "entity": "checkout-api", "version": st["version"],
                    "feature_flags": st["feature_flags"]}]
    elif "fail" in q or "error" in q:
        records = [{"metric": "failure_rate", "value": m["failure_rate"], "unit": "%"}]
    elif "latency" in q or "response" in q or "p99" in q:
        records = [{"metric": "p99_latency_ms", "value": m["p99_latency_ms"], "unit": "ms"}]
    elif "cpu" in q or "replica" in q or "saturation" in q:
        records = [{"metric": "cpu_utilization", "value": m["cpu_utilization"], "unit": "%",
                    "replicas": m["replicas"]}]
    else:
        records = [m]
    return {"query": dqlQueryString, "records": records}


def get_events_for_kubernetes_cluster(clusterId: str = "") -> dict:
    """Return recent Kubernetes events for the monitored cluster(s)."""
    st = _state()
    events = [{"reason": "Scheduled", "object": f"pod/checkout-api-{i}",
               "message": "Successfully assigned to node"} for i in range(st.get("replicas", 3))]
    fault = st.get("injected_fault")
    if not st.get("healthy", True) and fault == "latency_spike":
        events.append({"reason": "Unhealthy", "object": "pod/checkout-api",
                       "message": "Readiness probe failed: CPU throttling at 98%"})
    if not st.get("healthy", True) and fault == "memory_leak":
        events.append({"reason": "OOMKilled", "object": "pod/checkout-api",
                       "message": "Container memory usage exceeded limit; killed and restarted (CPU nominal)"})
    return {"events": events}


def get_vulnerabilities(riskLevel: str = "") -> dict:
    """List active security vulnerabilities detected by Dynatrace."""
    return {"vulnerabilities": [
        {"id": "CVE-2025-12345", "severity": "MEDIUM", "component": "libcheckout 1.4.2",
         "affected_entity": "checkout-api"}]}


def inprocess_tools() -> list:
    """The read-only observability tools for DYNATRACE_MCP_MODE=inprocess."""
    return [query_problems, execute_dql, get_events_for_kubernetes_cluster, get_vulnerabilities]
