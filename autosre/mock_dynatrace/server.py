"""Mock Dynatrace MCP server (stdio).

A bundled MCP server that speaks the same protocol as the official
@dynatrace-oss/dynatrace-mcp-server, so the agent uses the identical MCP transport
offline. The TOOL SURFACES are deliberately NOT identical: this mock mirrors a
Davis-PROBLEM workflow (query_problems / get_problem_by_id) so the demo can show a
Davis-shaped problem card the OTel-only trial tenant cannot raise, while the real
v1.8.6 server is DQL-FIRST (list_problems / execute_dql w/ dqlStatement /
get_kubernetes_events / list_vulnerabilities). The agent instruction is mode-aware
(see agent.py) so each path drives the tools it actually has. Telemetry here is
derived live from the checkout-api demo service's internal state, so injecting a
fault surfaces a real "problem" and a successful remediation makes it disappear.

Run:  python -m autosre.mock_dynatrace.server   (speaks MCP over stdio)
"""

from __future__ import annotations

import json
import os

import httpx
from mcp.server.fastmcp import FastMCP

from autosre.gcp_auth import target_headers

TARGET = os.environ.get("TARGET_SERVICE_URL", "http://localhost:8081")
mcp = FastMCP("dynatrace-mock")


def _state() -> dict:
    try:
        return httpx.get(
            f"{TARGET}/_internal/state", timeout=5.0, headers=target_headers(TARGET)
        ).json()
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
        metric = d["metric"]
        rpm = m.get("requests_per_min", 0)
        # Blast radius derived from live telemetry, so the human approves on
        # evidence (entities affected + requests/min at risk), not vibes.
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


@mcp.tool(name="query_problems")
def query_problems(status: str = "OPEN") -> str:
    """Query active Davis problems (open incidents) detected in the environment."""
    return json.dumps(_problems_payload(), indent=2)


@mcp.tool(name="get_problem_by_id")
def get_problem_by_id(problemId: str) -> str:
    """Read details of a single Davis problem by its display id."""
    for p in _problems_payload().get("problems", []):
        if p["problemId"] == problemId:
            return json.dumps(p, indent=2)
    return json.dumps({"error": f"problem {problemId} not found"})


@mcp.tool(name="execute_dql")
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


@mcp.tool(name="get_events_for_kubernetes_cluster")
def get_events_for_kubernetes_cluster(clusterId: str = "") -> str:
    """Return recent Kubernetes events for the monitored cluster(s)."""
    st = _state()
    events = [{"reason": "Scheduled", "object": f"pod/checkout-api-{i}",
               "message": "Successfully assigned to node"} for i in range(st.get("replicas", 3))]
    fault = st.get("injected_fault")
    if not st.get("healthy", True) and fault == "latency_spike":
        # Saturation signal: scaling is the right call.
        events.append({"reason": "Unhealthy", "object": "pod/checkout-api",
                       "message": "Readiness probe failed: CPU throttling at 98%"})
    if not st.get("healthy", True) and fault == "memory_leak":
        # OOM signal: more replicas won't help - this points to a rollback.
        events.append({"reason": "OOMKilled", "object": "pod/checkout-api",
                       "message": "Container memory usage exceeded limit; killed and restarted (CPU nominal)"})
    return json.dumps({"events": events}, indent=2)


@mcp.tool(name="get_vulnerabilities")
def get_vulnerabilities(riskLevel: str = "") -> str:
    """List active security vulnerabilities detected by Dynatrace."""
    return json.dumps({"vulnerabilities": [
        {"id": "CVE-2025-12345", "severity": "MEDIUM", "component": "libcheckout 1.4.2",
         "affected_entity": "checkout-api"}]}, indent=2)


if __name__ == "__main__":
    mcp.run()  # stdio transport
