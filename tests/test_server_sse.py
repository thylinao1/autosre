"""Tests for the Mission-Control HTTP/SSE backend (CONTRACT.md §1–§3).

Two layers:
  * Deterministic unit tests of the event adapter (no model): tool-JSON parsing,
    summaries, and the detect/diagnose/act/verify phase classifier.
  * A model-gated end-to-end test that injects a `payment_errors` fault, starts a
    run, consumes the live SSE stream, POSTs the approval, and asserts the
    documented event types appear and the run ends green. Skipped without a
    Gemini key (mirrors tests/test_agent_live.py).
"""

from __future__ import annotations

import asyncio
import json
import os

import httpx
import pytest
from google.adk.events import Event
from google.genai import types

from autosre.server import events as E

# ── adapter unit tests (deterministic, no model, no network) ─────────────────


@pytest.mark.unit
def test_parse_tool_response_parses_problem_json_string():
    raw = json.dumps(
        {
            "problems": [
                {
                    "problemId": "P-2026-0042",
                    "title": "Checkout failure rate spiked to 22% after deploy v2.3.1",
                    "impacted_metric": "failure_rate",
                    "observed_value": 22.0,
                }
            ],
            "total": 1,
        }
    )
    resp = E.parse_tool_response(raw)
    assert resp["problems"][0]["problemId"] == "P-2026-0042"
    summary = E.summarize_tool_result("query-problems", resp)
    assert "1 open problem" in summary
    assert "22%" in summary


@pytest.mark.unit
def test_parse_tool_response_unwraps_adk_result_envelope():
    inner = json.dumps({"query": "fetch events", "records": [{"version": "2.3.1"}]})
    resp = E.parse_tool_response({"result": inner})
    assert resp["records"][0]["version"] == "2.3.1"


@pytest.mark.unit
def test_parse_tool_response_passes_through_structured_dict():
    raw = {"action": "toggle_feature_flag", "resolved_incident": True, "service_healthy": True}
    resp = E.parse_tool_response(raw)
    assert resp["resolved_incident"] is True
    assert "healthy" in E.summarize_tool_result("toggle_feature_flag", resp)


@pytest.mark.unit
def test_parse_tool_response_falls_back_for_non_json():
    assert E.parse_tool_response("plain text") == {"text": "plain text"}


@pytest.mark.unit
def test_phase_tracker_advances_monotonically():
    pt = E.PhaseTracker()
    assert pt.advance_for_tool("query-problems")["phase"] == "detect"
    assert pt.advance_for_tool("get-problem-by-id") is None  # still detect
    assert pt.advance_for_tool("execute-dql")["phase"] == "diagnose"
    assert pt.advance_for_approval()["phase"] == "act"
    assert pt.advance_for_tool("get_service_health")["phase"] == "verify"
    # never regress to an earlier phase
    assert pt.advance_for_tool("query-problems") is None


# ── end-to-end SSE test (gated on Gemini credentials) ────────────────────────

_HAS_KEY = bool(os.environ.get("GOOGLE_API_KEY")) or \
    os.environ.get("GOOGLE_GENAI_USE_VERTEXAI", "").upper() == "TRUE"

_DOCUMENTED_TYPES = {
    "step", "tool_call", "tool_result", "approval_request",
    "approval_resolved", "agent_message", "final", "error",
}


def _parse_sse(text: str) -> list[dict]:
    """Parse raw SSE bytes into the list of JSON data frames (ignores comments).

    SSE uses CRLF on the wire (sse-starlette emits `\\r\\n`); normalize first so
    block/line splitting is robust regardless of the transport's newline style.
    """
    text = text.replace("\r\n", "\n")
    frames = []
    for block in text.split("\n\n"):
        data_lines = [ln[5:].lstrip() for ln in block.splitlines() if ln.startswith("data:")]
        if not data_lines:
            continue
        try:
            frames.append(json.loads("".join(data_lines)))
        except json.JSONDecodeError:
            continue
    return frames


# ── deterministic full-loop test via a scripted fake runner (no model) ───────
#
# Proves the transport + HITL pause/resume bridge emits every documented frame
# type for a payment_errors run, independent of the (flaky) live model. The fake
# runner yields the exact ADK Event sequence the real agent would, and its
# remediation tool call actually toggles the flag on the live checkout-api so the
# final health flips green — exactly like a real approved action.


class _ScriptedSession:
    id = "fake-session"


class _ScriptedSessionService:
    async def create_session(self, *, app_name, user_id):
        return _ScriptedSession()


def _ev(parts, *, final=False, long_running=None):
    kwargs = {"author": "autosre", "content": types.Content(role="model", parts=parts)}
    if long_running:
        kwargs["long_running_tool_ids"] = long_running
    return Event(**kwargs)


class _ScriptedRunner:
    """Mimics InMemoryRunner.run_async with a fixed detect→diagnose→act→verify script.

    `target_url` is where the (approved) remediation actually lands, so recovery
    is observable end-to-end.
    """

    def __init__(self, target_url: str) -> None:
        self.session_service = _ScriptedSessionService()
        self._target = target_url
        self._turn = 0

    async def run_async(self, *, user_id, session_id, new_message):
        self._turn += 1
        if self._turn == 1:
            # DETECT
            yield _ev([types.Part(function_call=types.FunctionCall(name="query-problems", args={}))])
            yield _ev([types.Part(function_response=types.FunctionResponse(
                name="query-problems",
                response={"result": json.dumps({
                    "problems": [{
                        "problemId": "P-2026-0042",
                        "title": "Checkout failure rate spiked to 22% after deploy v2.3.1",
                        "severity": "AVAILABILITY", "impacted_metric": "failure_rate",
                        "observed_value": 22.0,
                    }], "total": 1})}))])
            # DIAGNOSE
            yield _ev([types.Part(function_call=types.FunctionCall(
                name="execute-dql", args={"dqlQueryString": "fetch events | filter event.kind == \"DEPLOYMENT_EVENT\""}))])
            yield _ev([types.Part(function_response=types.FunctionResponse(
                name="execute-dql",
                response={"result": json.dumps({"records": [{
                    "version": "2.3.1", "feature_flags": {"new_payment_gateway": True}}]})}))])
            yield _ev([types.Part(text="Root cause: deploy v2.3.1 enabled 'new_payment_gateway' which throws on AMEX.")])
            # ACT — pause for human approval (ADK long-running confirmation call).
            yield _ev(
                [types.Part(function_call=types.FunctionCall(
                    id="adk-fc-test-1", name="adk_request_confirmation",
                    args={
                        "originalFunctionCall": {
                            "name": "toggle_feature_flag",
                            "args": {"name": "new_payment_gateway", "enabled": False},
                        },
                        "toolConfirmation": {"hint": "Disable the offending feature flag."},
                    }))],
                final=True, long_running=["adk-fc-test-1"],
            )
            return
        # Turn 2: resumed after approval — run the action for real, then verify.
        res = httpx.post(
            f"{self._target}/_admin/toggle_feature_flag",
            json={"name": "new_payment_gateway", "enabled": False}, timeout=10,
        ).json()
        yield _ev([types.Part(function_response=types.FunctionResponse(
            name="toggle_feature_flag", response=res))])
        yield _ev([types.Part(function_call=types.FunctionCall(name="get_service_health", args={}))])
        health = httpx.get(f"{self._target}/_internal/state", timeout=10).json()
        yield _ev([types.Part(function_response=types.FunctionResponse(
            name="get_service_health", response=health))])
        yield _ev([types.Part(text=(
            "Disabled feature flag 'new_payment_gateway' (operator-approved); "
            "checkout-api is healthy again."))], final=True)


@pytest.mark.asyncio
async def test_full_loop_emits_all_documented_frames_with_fake_runner(target_service):
    """End-to-end happy path over the real run driver + HITL bridge.

    Consumes the same frame generator the SSE endpoint wraps (`run.stream()`) and
    resolves the approval through the same path `POST /approval` uses
    (`run.submit_approval`). This exercises the full detect→diagnose→act→verify
    pipeline and the pause/resume bridge deterministically (no model). The SSE
    *wire* serialization and the HTTP approval gate (409/404) are covered by the
    other tests in this module.
    """
    os.environ.setdefault("ALLOWED_ORIGIN", "*")
    httpx.post(f"{target_service}/_admin/inject", json={"fault": "payment_errors"})
    from autosre.server.runs import IncidentRun

    run = IncidentRun(
        "det-run-1", None, runner_factory=lambda: _ScriptedRunner(target_service)
    )
    await run.start()

    seen: list[str] = []
    frames_by_type: dict[str, dict] = {}
    terminal: dict | None = None
    last_seq = -1

    async def consume():
        nonlocal terminal, last_seq
        async for frame in run.stream():
            assert frame["type"] in _DOCUMENTED_TYPES
            assert frame["run_id"] == "det-run-1"
            assert frame["seq"] == last_seq + 1  # monotonic, no gaps
            last_seq = frame["seq"]
            seen.append(frame["type"])
            frames_by_type.setdefault(frame["type"], frame)
            if frame["type"] == "approval_request":
                # Resolve via the same entry point POST /approval calls.
                assert run.submit_approval(frame["id"], True) is True
            if frame["type"] in ("final", "error"):
                terminal = frame
                return

    await asyncio.wait_for(consume(), timeout=20)

    # All nine-minus-error documented frame types appeared in order.
    assert {"step", "tool_call", "tool_result", "approval_request",
            "approval_resolved", "agent_message", "final"} <= set(seen)

    # The approval card carried the exact proposed action.
    ar = frames_by_type["approval_request"]
    assert ar["tool"] == "toggle_feature_flag"
    assert ar["args"] == {"name": "new_payment_gateway", "enabled": False}
    assert ar["id"] == "adk-fc-test-1"

    # Phase markers covered detect → diagnose → act → verify (one step each).
    assert seen.count("step") == 4

    # The DETECT tool_result parsed structured problems for the UI card.
    tr = frames_by_type["tool_result"]
    assert "problems" in tr["response"] or "records" in tr["response"]

    # Terminal: resolved + green, action ran.
    assert terminal["type"] == "final"
    assert terminal["service_healthy"] is True
    assert terminal["incident_resolved"] is True
    assert terminal["outcome"] == "resolved"
    state = httpx.get(f"{target_service}/_internal/state").json()
    assert state["healthy"] is True
    assert any(e["resolved"] for e in state["remediation_log"])


class _RejectScriptedRunner:
    """Reproduces the REAL ADK confirmation flow for a remediation the operator REJECTS.

    The detail the happy-path runner omits — and that hides the bug — is that ADK
    emits a function_response for the *gated* tool (the "requires confirmation"
    stub) in the same turn as the approval request, i.e. BEFORE the human decides.
    Verified live: the deployed agent rendered "result: toggle_feature_flag
    returned." while the approval modal was still open. A classifier that treats
    that stub as "the action ran" mislabels a rejection as an approval.
    """

    def __init__(self, target_url: str) -> None:
        self.session_service = _ScriptedSessionService()
        self._target = target_url
        self._turn = 0

    async def run_async(self, *, user_id, session_id, new_message):
        self._turn += 1
        if self._turn == 1:
            yield _ev([types.Part(function_call=types.FunctionCall(name="query-problems", args={}))])
            yield _ev([types.Part(function_response=types.FunctionResponse(
                name="query-problems",
                response={"result": json.dumps({"problems": [{
                    "problemId": "P-2026-0042",
                    "title": "Checkout failure rate spiked to 22% after deploy v2.3.1",
                    "severity": "AVAILABILITY", "impacted_metric": "failure_rate",
                    "observed_value": 22.0}], "total": 1})}))])
            yield _ev([types.Part(text="Root cause: 'new_payment_gateway' on v2.3.1 fails on AMEX.")])
            # The ADK confirmation STUB for the gated tool, emitted before the human
            # decides. This is the frame that must NOT be counted as "the action ran".
            yield _ev([types.Part(function_response=types.FunctionResponse(
                name="toggle_feature_flag",
                response={"result": json.dumps(
                    {"error": "This tool call requires confirmation, please approve or reject."})}))])
            yield _ev(
                [types.Part(function_call=types.FunctionCall(
                    id="adk-fc-reject-1", name="adk_request_confirmation",
                    args={"originalFunctionCall": {"name": "toggle_feature_flag",
                                                   "args": {"name": "new_payment_gateway", "enabled": False}},
                          "toolConfirmation": {"hint": "Disable the offending feature flag."}}))],
                final=True, long_running=["adk-fc-reject-1"],
            )
            return
        # Turn 2: resumed after REJECTION — the agent stands down, no remediation runs.
        yield _ev([types.Part(text=(
            "Operator rejected the fix. Standing down — no changes made to checkout-api."))], final=True)


@pytest.mark.asyncio
async def test_rejected_run_is_audited_as_declined_not_approved(target_service):
    """A REJECTED remediation must be audited as decision:rejected / outcome:declined.

    Guards the marquee deny beat AND the "auditable autonomy" claim. The ADK
    confirmation stub for the gated tool arrives before the human decides, so the
    terminal classifier must derive the decision from the operator's choice, not
    from having observed a remediation tool_result. Without the fix this run is
    mislabeled approved/unresolved — verified live on the deployed agent's ledger.
    """
    from autosre.server import ledger
    from autosre.server.runs import IncidentRun

    httpx.post(f"{target_service}/_admin/inject", json={"fault": "payment_errors"})
    ledger.clear()

    run = IncidentRun(
        "reject-run-1", None, runner_factory=lambda: _RejectScriptedRunner(target_service)
    )
    await run.start()

    terminal: dict | None = None
    resolved_frame: dict | None = None

    async def consume():
        nonlocal terminal, resolved_frame
        async for frame in run.stream():
            if frame["type"] == "approval_request":
                assert run.submit_approval(frame["id"], False) is True  # REJECT
            if frame["type"] == "approval_resolved":
                resolved_frame = frame
            if frame["type"] in ("final", "error"):
                terminal = frame
                return

    await asyncio.wait_for(consume(), timeout=20)

    # The approval_resolved frame carries the rejection.
    assert resolved_frame is not None and resolved_frame["approved"] is False
    # The terminal frame reflects a stand-down, not a (non-)resolution.
    assert terminal["type"] == "final"
    assert terminal["outcome"] == "declined"
    assert terminal["incident_resolved"] is False

    # The audit ledger tells the truth: the operator REJECTED; nothing acted.
    entry = ledger.recent(1)[0]
    assert entry["run_id"] == "reject-run-1"
    assert entry["decision"] == "rejected"
    assert entry["outcome"] == "declined"
    assert entry["action"] is None

    # Production was untouched: the fault is still present.
    state = httpx.get(f"{target_service}/_internal/state").json()
    assert state["healthy"] is False
    ledger.clear()


class _AllClearRunner:
    """A run that finds no problems — exercises the no-approval terminal path."""

    def __init__(self, *_a, **_k) -> None:
        self.session_service = _ScriptedSessionService()

    async def run_async(self, *, user_id, session_id, new_message):
        yield _ev([types.Part(function_call=types.FunctionCall(name="query-problems", args={}))])
        yield _ev([types.Part(function_response=types.FunctionResponse(
            name="query-problems",
            response={"result": json.dumps({"problems": [], "total": 0})}))])
        yield _ev([types.Part(text="All clear — no open problems on checkout-api.")], final=True)


@pytest.mark.asyncio
async def test_sse_endpoint_serializes_frames_over_http(target_service):
    """Verify the real HTTP SSE wire format (event:/data:), CORS, and ordering."""
    os.environ.setdefault("ALLOWED_ORIGIN", "*")
    httpx.post(f"{target_service}/_admin/inject", json={"fault": "clear"})
    from autosre.server.app import app, registry

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        run = await registry.create(prompt=None, runner_factory=_AllClearRunner)
        # CORS allow-origin advertised on a normal endpoint.
        h = await client.get("/healthz", headers={"Origin": "http://localhost:3000"})
        assert h.headers.get("access-control-allow-origin") in ("*", "http://localhost:3000")

        body = (await client.get(f"/api/incident/{run.run_id}/stream", timeout=20.0)).text
        # Raw wire: `event: <type>` lines pair with their `data:` JSON lines.
        assert "event: step" in body
        assert "event: tool_call" in body
        assert "event: tool_result" in body
        assert "event: final" in body
        frames = _parse_sse(body)
        types_seen = [f["type"] for f in frames]
        assert types_seen[0] == "step" and types_seen[-1] == "final"
        # Each data frame carries the discriminant + run_id + monotonic seq.
        for i, f in enumerate(frames):
            assert f["run_id"] == run.run_id
            assert f["seq"] == i
        # The SSE `event:` field equals each frame's `type` (CONTRACT §1.2).
        event_lines = [ln[7:].strip() for ln in body.replace("\r\n", "\n").splitlines()
                       if ln.startswith("event:")]
        assert event_lines == types_seen
        final = frames[-1]
        assert final["outcome"] == "all_clear"
        assert final["incident_resolved"] is False


@pytest.fixture
def agent_server(target_service):
    """Boot the real Mission-Control backend on its own port (live model path).

    A real server (not httpx.ASGITransport) is required here so the SSE GET and
    the approval POST run as independent connections — the human approval arrives
    on a separate socket while the stream stays open, exactly as the UI does it.
    """
    import socket
    import subprocess
    import sys

    repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    env = {**os.environ, "PYTHONPATH": repo, "PORT": str(port),
           "HOST": "127.0.0.1", "ALLOWED_ORIGIN": "*"}
    proc = subprocess.Popen(
        [sys.executable, "-m", "autosre.server"],
        cwd=repo, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    base = f"http://127.0.0.1:{port}"
    try:
        for _ in range(100):
            try:
                if httpx.get(f"{base}/healthz", timeout=1).status_code == 200:
                    break
            except Exception:  # noqa: BLE001
                import time
                time.sleep(0.2)
        else:
            raise RuntimeError("agent server did not start")
        yield base
    finally:
        proc.terminate()
        proc.wait(timeout=10)


@pytest.mark.skipif(not _HAS_KEY, reason="no Gemini credentials configured")
@pytest.mark.asyncio
async def test_sse_stream_emits_documented_events_for_payment_incident(
    target_service, agent_server
):
    """Drive inject → start → stream → approve → final over a real running server."""
    async with httpx.AsyncClient(base_url=agent_server) as client:
        # 1) start with injection (the agent will detect a real problem).
        start = await client.post(
            "/api/incident/start", json={"inject": "payment_errors"}, timeout=30.0
        )
        assert start.status_code == 200
        run_id = start.json()["run_id"]

        seen: set[str] = set()
        approved_id: str | None = None
        terminal: dict | None = None

        # A second independent client issues the approval POST while the SSE GET
        # below stays open (mirrors a browser: separate connection).
        async def _approve(cid: str):
            async with httpx.AsyncClient(base_url=agent_server) as poster:
                r = await poster.post(
                    f"/api/incident/{run_id}/approval",
                    json={"confirmation_id": cid, "approved": True}, timeout=30.0,
                )
                assert r.status_code == 200

        approval_tasks: list[asyncio.Task] = []
        # 2) consume the stream; POST approval when the request frame arrives.
        async with client.stream(
            "GET", f"/api/incident/{run_id}/stream", timeout=240.0
        ) as resp:
            assert resp.status_code == 200
            assert "text/event-stream" in resp.headers["content-type"]
            buffer = ""
            async for chunk in resp.aiter_text():
                buffer += chunk.replace("\r\n", "\n")
                while "\n\n" in buffer:
                    block, buffer = buffer.split("\n\n", 1)
                    for frame in _parse_sse(block + "\n\n"):
                        seen.add(frame["type"])
                        assert frame["type"] in _DOCUMENTED_TYPES
                        assert frame["run_id"] == run_id
                        assert "seq" in frame
                        if frame["type"] == "approval_request" and approved_id is None:
                            approved_id = frame["id"]
                            approval_tasks.append(asyncio.create_task(_approve(approved_id)))
                        if frame["type"] in ("final", "error"):
                            terminal = frame
                if terminal is not None:
                    break
        for t in approval_tasks:
            await t

    # An upstream model outage (503/UNAVAILABLE) or exhausted free-tier rate limit
    # surfaces as a contract-correct `error` frame. That is an environment blip,
    # not a defect in the transport, so skip rather than fail the suite on it
    # (the deterministic tests already pin the full-loop frame contract). We still
    # assert the error frame is well-formed and leaks no secrets.
    if terminal is not None and terminal["type"] == "error":
        assert isinstance(terminal["message"], str) and terminal["message"]
        assert "key" not in terminal["message"].lower()
        assert isinstance(terminal["retriable"], bool)
        pytest.skip(f"upstream model error during e2e run: {terminal['message']}")

    # 3) assertions: the documented happy-path frames appeared and ended green.
    assert {"step", "tool_call", "tool_result", "approval_request",
            "approval_resolved", "final"} <= seen, f"missing frames; saw {seen}"
    assert terminal is not None and terminal["type"] == "final"
    assert terminal["service_healthy"] is True
    assert terminal["incident_resolved"] is True
    # The injected fault is cleared independently of the agent's narrative.
    state = httpx.get(f"{target_service}/_internal/state").json()
    assert state["healthy"] is True


@pytest.mark.asyncio
async def test_approval_mismatch_returns_409(target_service):
    """A stale/unknown confirmation_id with no pending approval -> 409."""
    os.environ.setdefault("ALLOWED_ORIGIN", "*")
    from autosre.server.app import app, registry

    # Create a run object directly (no model needed) and assert the gate.
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        run = await registry.create(prompt="noop")
        # No approval is pending immediately after start.
        resp = await client.post(
            f"/api/incident/{run.run_id}/approval",
            json={"confirmation_id": "bogus-id", "approved": True},
        )
        assert resp.status_code == 409
        # Unknown run -> 404.
        resp2 = await client.post(
            "/api/incident/does-not-exist/approval",
            json={"confirmation_id": "x", "approved": True},
        )
        assert resp2.status_code == 404


@pytest.mark.asyncio
async def test_demo_endpoints_proxy_target(target_service):
    """inject/reset/health proxy the checkout-api admin surface."""
    os.environ.setdefault("ALLOWED_ORIGIN", "*")
    from autosre.server.app import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        inj = await client.post("/api/demo/inject", json={"fault": "payment_errors"})
        assert inj.status_code == 200
        assert inj.json()["injected"] == "payment_errors"

        health = await client.get("/api/demo/health")
        assert health.status_code == 200
        assert health.json()["healthy"] is False
        assert health.json()["injected_fault"] == "payment_errors"

        reset = await client.post("/api/demo/reset")
        assert reset.status_code == 200
        assert reset.json()["injected"] is None

        health2 = await client.get("/api/demo/health")
        assert health2.json()["healthy"] is True
