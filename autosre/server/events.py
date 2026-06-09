"""Event adapter: turn loop observations into CONTRACT.md §2 SSE frames.

Pure, side-effect-free helpers:
  * `parse_tool_response` - Dynatrace tools return JSON *strings*; this parses
    them into structured `response` objects (problems / records / state) so the
    UI's problem card (`response.problems[0]`) and DQL panel (`response.records`)
    get real data. Non-JSON falls back to `{"text": "<raw>"}`.
  * `summarize_tool_result` - a one-line `summary` for the timeline.
  * `PhaseTracker` - classifies the loop into detect/diagnose/act/verify and
    emits at most one `step` per phase transition (CONTRACT §2.1).
  * frame builders for each of the nine event types.

These functions never touch I/O or sessions; `runs.py` wires them to the stream.
"""

from __future__ import annotations

import json
from typing import Any

# Tool-name → phase the call belongs to (CONTRACT §2.1). The boundary that fires
# the `step` is the *first* tool that signals a new phase. Both the bundled mock
# and the real @dynatrace-oss/dynatrace-mcp-server v1.8.6 expose snake_case names;
# the two surfaces differ (mock: query_problems; real: list_problems / DQL-first).
# The kebab-case variants are kept so synthetic contract fixtures and any older
# gateway naming still map. The verify tool (`get_service_health`) and the
# remediation tools are LOCAL functions, not Dynatrace.
_DETECT_TOOLS = {
    "query_problems", "get_problem_by_id", "list_problems",
    "query-problems", "get-problem-by-id",
}
_DIAGNOSE_TOOLS = {
    "execute_dql", "get_events_for_kubernetes_cluster", "get_vulnerabilities",
    "get_kubernetes_events", "list_vulnerabilities",
    "execute-dql", "get-events-for-kubernetes-cluster", "get-vulnerabilities",
}
_VERIFY_TOOLS = {"get_service_health"}
_REMEDIATION_TOOLS = {"scale_service", "rollback_deployment", "toggle_feature_flag"}

_PHASE_STATUS = {
    "detect": "Pulling open problems from Dynatrace…",
    "diagnose": "Querying DQL evidence to pin the root cause…",
    "act": "Proposing a remediation - awaiting human approval…",
    "verify": "Re-checking service health to confirm recovery…",
}

# Phase ordering - we only ever advance forward, never regress.
_PHASE_ORDER = {"detect": 0, "diagnose": 1, "act": 2, "verify": 3}


def _unwrap_mcp_envelope(d: dict[str, Any]) -> Any:
    """Pull the JSON payload string out of an ADK MCP CallToolResult envelope.

    The real ADK MCP transport wraps a tool's return as
    ``{"content": [{"type": "text", "text": "<json>"}], "structuredContent":
    {"result": "<json>"}, "isError": false}`` - NOT a bare ``{"result": "<str>"}``.
    Prefer ``structuredContent.result``; fall back to concatenated text parts.
    Returns the inner string (to be JSON-parsed), or ``None`` if not an envelope.
    """
    sc = d.get("structuredContent")
    if isinstance(sc, dict) and isinstance(sc.get("result"), str):
        return sc["result"]
    content = d.get("content")
    if isinstance(content, list):
        texts = [
            p.get("text", "")
            for p in content
            if isinstance(p, dict) and p.get("type") == "text"
        ]
        if texts:
            return "".join(texts)
    return None


def parse_tool_response(raw: Any) -> dict[str, Any]:
    """Coerce a tool's return value into a structured dict.

    ADK function_response payloads arrive as the MCP CallToolResult envelope
    (`content`/`structuredContent`), a dict wrapping a `result` string, a bare
    JSON string, or already-structured data. We unwrap and JSON-parse so the UI
    gets `problems` / `records` / state keys.
    """
    candidate = raw

    if isinstance(candidate, dict):
        # If it already looks structured (has our known keys), pass through.
        known = {"problems", "records", "events", "vulnerabilities", "metrics",
                 "healthy", "resolved_incident", "service_healthy"}
        if known & set(candidate.keys()):
            return candidate
        # Real ADK MCP envelope (content list / structuredContent.result).
        inner = _unwrap_mcp_envelope(candidate)
        if inner is not None:
            candidate = inner
        else:
            # Simpler wrappers: {"result": "<json>"} etc.
            for key in ("result", "content", "text", "output"):
                if key in candidate and isinstance(candidate[key], str):
                    candidate = candidate[key]
                    break
            else:
                return candidate

    if isinstance(candidate, str):
        try:
            parsed = json.loads(candidate)
            return parsed if isinstance(parsed, dict) else {"value": parsed}
        except (json.JSONDecodeError, ValueError):
            return {"text": candidate}

    if isinstance(candidate, dict):
        return candidate
    return {"value": candidate}


def summarize_tool_result(name: str, response: dict[str, Any]) -> str:
    """One-line human summary for the timeline."""
    if "problems" in response:
        problems = response.get("problems") or []
        if not problems:
            return "No open problems - service is clear."
        p = problems[0]
        n = len(problems)
        return (
            f"{n} open problem{'s' if n != 1 else ''}: "
            f"{p.get('title', 'unknown problem')}"
        )
    if "records" in response:
        records = response.get("records") or []
        if records:
            head = records[0]
            if "version" in head:
                return f"Deploy history: version {head['version']}, flags {head.get('feature_flags', {})}"
            if "metric" in head:
                return f"{head['metric']} = {head.get('value')}{head.get('unit', '')}"
        return f"DQL returned {len(records)} row(s)."
    if "events" in response:
        return f"{len(response.get('events') or [])} Kubernetes event(s)."
    if "vulnerabilities" in response:
        return f"{len(response.get('vulnerabilities') or [])} vulnerability(ies)."
    if "resolved_incident" in response or "service_healthy" in response:
        healthy = response.get("service_healthy")
        return f"Action applied - service {'healthy' if healthy else 'still degraded'}."
    if "healthy" in response:
        return f"Service health: {'healthy' if response.get('healthy') else 'degraded'}."
    return f"{name} returned."


def phase_for_tool(name: str) -> str | None:
    if name in _DETECT_TOOLS:
        return "detect"
    if name in _DIAGNOSE_TOOLS:
        return "diagnose"
    if name in _VERIFY_TOOLS:
        return "verify"
    if name in _REMEDIATION_TOOLS:
        return "act"
    return None


class PhaseTracker:
    """Emits at most one `step` per forward phase transition."""

    def __init__(self) -> None:
        self._current: str | None = None

    def advance_for_tool(self, name: str) -> dict[str, str] | None:
        """Given a tool name, return a step payload if a new phase started.

        A re-query of Dynatrace problems *after* remediation is a verify-phase
        confirmation ("did the open problem clear?"), not a second detect. This
        is what makes Dynatrace bookend the loop: the same tool opens the
        incident and confirms recovery.
        """
        phase = phase_for_tool(name)
        if phase == "detect" and self._current in ("act", "verify"):
            phase = "verify"
        # get_service_health read during DIAGNOSE (before any action) is diagnostic
        # evidence - live agents call it to read deploy version / flags - not
        # recovery confirmation. Keep the phase at diagnose so the approval still
        # renders under ACT, not a premature VERIFY. It only means verify once an
        # action has happened (current is act/verify).
        if phase == "verify" and self._current not in ("act", "verify"):
            phase = "diagnose"
        return self._advance(phase)

    def advance_for_approval(self) -> dict[str, str] | None:
        """An approval_request always means we are in (or entering) `act`."""
        return self._advance("act")

    def _advance(self, phase: str | None) -> dict[str, str] | None:
        if phase is None:
            return None
        if self._current is not None and _PHASE_ORDER[phase] <= _PHASE_ORDER[self._current]:
            return None
        self._current = phase
        return {"phase": phase, "status": _PHASE_STATUS[phase]}

    @property
    def current(self) -> str | None:
        return self._current


# ── Frame builders (each returns the JSON object; run_id/seq stamped by runs.py) ──


def step_frame(phase: str, status: str) -> dict[str, Any]:
    return {"type": "step", "phase": phase, "status": status}


def tool_call_frame(name: str, args: dict[str, Any]) -> dict[str, Any]:
    return {"type": "tool_call", "name": name, "args": args}


def tool_result_frame(name: str, response: dict[str, Any], summary: str) -> dict[str, Any]:
    return {"type": "tool_result", "name": name, "summary": summary, "response": response}


def approval_request_frame(pending: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "approval_request",
        "id": pending["id"],
        "tool": pending["tool"],
        "args": pending["args"],
        "hint": pending.get("hint", ""),
        # Graduated-autonomy risk tier {tier, rationale} for this action.
        "risk": pending.get("risk"),
    }


def approval_resolved_frame(confirmation_id: str, approved: bool) -> dict[str, Any]:
    return {"type": "approval_resolved", "id": confirmation_id, "approved": approved}


def agent_message_frame(text: str, done: bool) -> dict[str, Any]:
    return {"type": "agent_message", "text": text, "done": done}


def final_frame(
    report: str,
    service_healthy: bool,
    incident_resolved: bool,
    outcome: str,
) -> dict[str, Any]:
    return {
        "type": "final",
        "report": report,
        "service_healthy": service_healthy,
        "incident_resolved": incident_resolved,
        "outcome": outcome,
    }


def error_frame(message: str, retriable: bool) -> dict[str, Any]:
    return {"type": "error", "message": message, "retriable": retriable}
