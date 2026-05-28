"""Regression test: parse_tool_response must unwrap the REAL ADK MCP envelope.

A live run revealed ADK delivers MCP tool output as a CallToolResult envelope
(`{"content": [{"type": "text", "text": "<json>"}], "structuredContent":
{"result": "<json>"}}`) — not a bare JSON string. If the parser fails to unwrap
it, the UI's problem card (`response.problems[0]`) and DQL panel
(`response.records`) render empty in the live demo. These tests pin the real
wire shapes captured from the running mock Dynatrace MCP server over ADK.
"""

from __future__ import annotations

import json

from autosre.server.events import parse_tool_response, summarize_tool_result

# The exact problems payload the mock server returns (autosre/mock_dynatrace/server.py).
_PROBLEMS_JSON = json.dumps({
    "problems": [{
        "problemId": "P-2026-0042",
        "title": "Checkout failure rate spiked to 22% after deploy v2.3.1",
        "severity": "AVAILABILITY",
        "status": "OPEN",
        "affected_entity": "checkout-api",
        "impacted_metric": "failure_rate",
        "observed_value": 22.0,
        "deploy_version": "2.3.1",
        "active_feature_flags": {"new_payment_gateway": True},
    }],
    "total": 1,
})


def _mcp_envelope(payload_json: str) -> dict:
    """The shape ADK actually hands to function_response.response."""
    return {
        "content": [{"type": "text", "text": payload_json}],
        "structuredContent": {"result": payload_json},
        "isError": False,
    }


def test_unwraps_structured_content_result():
    parsed = parse_tool_response(_mcp_envelope(_PROBLEMS_JSON))
    assert parsed["total"] == 1
    assert parsed["problems"][0]["impacted_metric"] == "failure_rate"
    # The UI's problem card reads response.problems[0] — it must be present.
    assert parsed["problems"][0]["observed_value"] == 22.0


def test_unwraps_content_text_when_no_structured_content():
    env = {"content": [{"type": "text", "text": _PROBLEMS_JSON}], "isError": False}
    parsed = parse_tool_response(env)
    assert parsed["problems"][0]["title"].startswith("Checkout failure rate")


def test_summary_is_meaningful_after_unwrap():
    parsed = parse_tool_response(_mcp_envelope(_PROBLEMS_JSON))
    summary = summarize_tool_result("list_problems", parsed)
    # Not the generic "list_problems returned." fallback.
    assert "1 open problem" in summary
    assert "22%" in summary


def test_dql_records_envelope_unwraps():
    dql_json = json.dumps({
        "query": "fetch events",
        "records": [{"event": "DEPLOYMENT", "version": "2.3.1",
                     "feature_flags": {"new_payment_gateway": True}}],
    })
    parsed = parse_tool_response(_mcp_envelope(dql_json))
    assert parsed["records"][0]["version"] == "2.3.1"


def test_already_structured_passes_through():
    structured = {"problems": [], "total": 0}
    assert parse_tool_response(structured) == structured


def test_bare_json_string_still_parses():
    assert parse_tool_response(_PROBLEMS_JSON)["total"] == 1


def test_non_json_falls_back_to_text():
    assert parse_tool_response("not json")["text"] == "not json"
