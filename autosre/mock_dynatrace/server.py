"""Mock Dynatrace MCP server (stdio).

Mirrors the tool surface of the official @dynatrace-oss/dynatrace-mcp-server so the
AutoSRE agent talks to an identical interface whether it's pointed at this mock or
a real Dynatrace tenant. Telemetry is derived live from the checkout-api demo
service's internal state, so injecting a fault there surfaces a real "problem"
here, and a successful remediation makes the problem disappear.

Run:  python -m autosre.mock_dynatrace.server   (speaks MCP over stdio)
"""

from __future__ import annotations

import json
import os

import httpx
from mcp.server.fastmcp import FastMCP

TARGET = os.environ.get("TARGET_SERVICE_URL", "http://localhost:8081")
mcp = FastMCP("dynatrace-mock")


def _state() -> dict:
    try:
        return httpx.get(f"{TARGET}/_internal/state", timeout=5.0).json()
    except Exception as exc:  # noqa: BLE001 - surface as a tool-visible message
        return {"error": f"could not reach target service at {TARGET}: {exc}"}


def _problems_payload() -> dict:
    """Active Davis-problems payload from live target state (shared by tools)."""
    st = _state()
    if st.get("error"):
        return {"problems": [], "note": st["error"]}
    problems = []
    if not st.get("healthy", True):
        d = st["active_fault_detail"]
        m = st["metrics"]
        problems.append({
            "problemId": "P-2026-0042",
            "title": d["summary"],
            "severity": "AVAILABILITY" if d["metric"] == "failure_rate" else "PERFORMANCE",
            "status": "OPEN",
            "affected_entity": "checkout-api",
            "impacted_metric": d["metric"],
            "observed_value": m.get(d["metric"]),
            "deploy_version": st["version"],
            "active_feature_flags": st["feature_flags"],
        })
    return {"problems": problems, "total": len(problems)}


@mcp.tool(name="query-problems")
def query_problems(status: str = "OPEN") -> str:
    """Query active Davis problems (open incidents) detected in the environment."""
    return json.dumps(_problems_payload(), indent=2)


@mcp.tool(name="get-problem-by-id")
def get_problem_by_id(problemId: str) -> str:
    """Read details of a single Davis problem by its display id."""
    for p in _problems_payload().get("problems", []):
        if p["problemId"] == problemId:
            return json.dumps(p, indent=2)
    return json.dumps({"error": f"problem {problemId} not found"})


@mcp.tool(name="execute-dql")
def execute_dql(dqlQueryString: str) -> str:
    """Execute a Dynatrace Query Language (DQL) statement and return result rows.

    The mock recognizes intent from keywords (metrics / failure / latency / cpu /
    events / deployment) and returns the matching slice of live telemetry.
    """
    st = _state()
    if st.get("error"):
        return json.dumps({"records": [], "note": st["error"]})
    m = st["metrics"]
    q = dqlQueryString.lower()
    if "deploy" in q or "version" in q or "event" in q:
        records = [{"timestamp": "2026-05-28T11:58:00Z", "event": "DEPLOYMENT",
                    "entity": "checkout-api", "version": st["version"],
                    "feature_flags": st["feature_flags"]}]
    elif "fail" in q or "error" in q:
        records = [{"metric": "failure_rate", "value": m["failure_rate"], "unit": "%"}]
    elif "latency" in q or "response" in q:
        records = [{"metric": "p99_latency_ms", "value": m["p99_latency_ms"], "unit": "ms"}]
    elif "cpu" in q or "replica" in q or "saturation" in q:
        records = [{"metric": "cpu_utilization", "value": m["cpu_utilization"], "unit": "%",
                    "replicas": m["replicas"]}]
    else:
        records = [m]
    return json.dumps({"query": dqlQueryString, "records": records}, indent=2)


@mcp.tool(name="get-events-for-kubernetes-cluster")
def get_events_for_kubernetes_cluster(clusterId: str = "") -> str:
    """Return recent Kubernetes events for the monitored cluster(s)."""
    st = _state()
    events = [{"reason": "Scheduled", "object": f"pod/checkout-api-{i}",
               "message": "Successfully assigned to node"} for i in range(st.get("replicas", 3))]
    if not st.get("healthy", True) and st.get("injected_fault") == "latency_spike":
        events.append({"reason": "Unhealthy", "object": "pod/checkout-api",
                       "message": "Readiness probe failed: CPU throttling"})
    return json.dumps({"events": events}, indent=2)


@mcp.tool(name="get-vulnerabilities")
def get_vulnerabilities(riskLevel: str = "") -> str:
    """List active security vulnerabilities detected by Dynatrace."""
    return json.dumps({"vulnerabilities": [
        {"id": "CVE-2025-12345", "severity": "MEDIUM", "component": "libcheckout 1.4.2",
         "affected_entity": "checkout-api"}]}, indent=2)


if __name__ == "__main__":
    mcp.run()  # stdio transport
