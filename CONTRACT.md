# CONTRACT.md — AutoSRE Agent ⇄ Mission-Control UI streaming interface

**Status: LOCKED (2026-05-28).** This is the canonical interface between the agent
backend (Workstream B, `autosre/`) and the web UI (Workstream A, `web/`). Build
against this document — do not redefine the wire format. Any change requires a new
dated line in `DECISION-LOG.md`.

> The contract is **mode-agnostic**. The agent core is identical across
> `DYNATRACE_MCP_MODE=mock | stdio | remote` (see `autosre/agent/dynatrace.py`) —
> the tool names and the events below are byte-identical in all three modes. The UI
> never knows or cares which mode the agent is in.

---

## 0. Roles & terminology

- **Backend** = a thin HTTP service (Workstream B) that wraps the existing ADK
  `InMemoryRunner` loop from `autosre/run_agent.py` and re-emits each ADK event as a
  typed JSON SSE frame. It owns the session, the model loop, and the approval pause.
- **UI** = the browser app (Workstream A). It starts a run, subscribes to the SSE
  stream, renders the timeline + problem card, and POSTs the approval decision.
- **Run / session** = one incident sweep. Identified by a `run_id` (string, server-
  generated, e.g. a UUID). All endpoints below are scoped to a `run_id`.

The backend MUST set CORS headers allowing the UI origin (see `ARCHITECTURE.md`).

---

## 1. Transport & endpoints

Transport is **HTTP + Server-Sent Events (SSE)**, served by an `adk api_server`-style
service. SSE (not raw WebSocket) because the stream is one-directional agent→UI; the
approval decision goes back over a separate plain POST. The backend may implement
these as a small FastAPI layer in front of the ADK runner, or as custom routes added
to `adk api_server`.

Base URL is the agent origin (e.g. `https://autosre-xxxx.run.app`), injected into the
UI as `NEXT_PUBLIC_AGENT_BASE_URL` (see `ARCHITECTURE.md`). All paths below are relative
to that base.

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 1 | `POST` | `/api/incident/start` | Start a new incident sweep. Optionally inject a fault first. Returns a `run_id`. |
| 2 | `GET`  | `/api/incident/{run_id}/stream` | **SSE** stream of typed events for that run. |
| 3 | `POST` | `/api/incident/{run_id}/approval` | Submit the human approve/reject decision; resumes the agent. |
| 4 | `POST` | `/api/demo/inject` | Demo control: inject a fault into `checkout-api` (proxies the target's `/_admin/inject`). |
| 5 | `POST` | `/api/demo/reset` | Demo control: clear all faults (`/_admin/inject {"fault":"clear"}`). |
| 6 | `GET`  | `/api/demo/health` | Read live `checkout-api` state (proxies `/_internal/state`); used to render the recovery/green state and for liveness checks. |

> A single `start` call that injects a fault and then streams the full loop is the
> primary demo path: the UI can drive the entire "inject → detect → diagnose →
> approve → act → verify → green" sequence with two calls (`start`, then `approval`).

### 1.1 `POST /api/incident/start`

Starts the sweep. If `inject` is provided, the backend injects that fault into the
target service **before** kicking off the agent (so the agent detects a real problem).

Request body:
```json
{
  "inject": "payment_errors",
  "prompt": "Run an incident sweep on checkout-api. Detect open problems, diagnose the root cause with evidence, and remediate the issue."
}
```
- `inject` — optional, one of `"payment_errors" | "latency_spike" | null`. `null`/omitted ⇒ no injection (agent may report "All clear").
- `prompt` — optional. Omit to use the default sweep prompt above (the exact text from `run_agent.py:104`).

Response `200`:
```json
{ "run_id": "5f1c2a9e-7d3b-4f0a-9c11-2b6e4d8a1f33", "status": "started" }
```

### 1.2 `GET /api/incident/{run_id}/stream`

Returns `Content-Type: text/event-stream`. Each frame is one event from §2,
serialized as a single SSE `data:` line. The SSE `event:` field MUST equal the
event's `type`, and the JSON object is sent in `data:`. Example wire bytes:

```
event: tool_call
data: {"type":"tool_call","run_id":"5f1c...","seq":3,"name":"execute_dql","args":{"query":"fetch events | filter event.kind == \"DEPLOYMENT_EVENT\""}}

event: approval_request
data: {"type":"approval_request","run_id":"5f1c...","seq":7,"id":"adk-fc-abc123","tool":"toggle_feature_flag","args":{"name":"new_payment_gateway","enabled":false},"hint":"Disable the offending feature flag on checkout-api."}

```

- Every event carries `type` (string, the discriminant), `run_id` (string), and
  `seq` (integer, monotonically increasing per run, starting at 0). `seq` lets the UI
  order/dedupe.
- The stream stays open across the approval pause. After `approval_request`, the
  backend blocks the agent loop until the matching `POST .../approval` arrives, then
  continues emitting on the **same** open stream.
- The stream ends after the terminal event (`final` or `error`). The backend SHOULD
  send a final SSE comment `: done` and close. The UI should treat stream close after
  `final`/`error` as normal.
- Recommended: emit an SSE comment heartbeat (`: ping`) every ~15s to keep proxies
  (Cloud Run) from idle-closing the connection.

### 1.3 `POST /api/incident/{run_id}/approval`

See §3.

### 1.4 `POST /api/demo/inject` and `POST /api/demo/reset`

See §4.

---

## 2. Event schema (discriminated union on `type`)

Every event is a JSON object with `type`, `run_id`, `seq`. The following nine `type`
values are the complete set the UI must handle. Each maps to a specific observation in
the ADK event stream that `autosre/run_agent.py` already inspects (line numbers cited
against `run_agent.py` as committed at `749f512`).

### 2.1 `step` — phase marker
Emitted when the backend infers a loop-phase boundary. Source: the backend classifies
the agent's progress (which tool was called / final response) into one of the four
phases of the instruction loop in `autosre/agent/agent.py:33-57`. `detect` precedes the
first `list_problems`; `diagnose` precedes `execute_dql`/`get_kubernetes_events`; `act`
precedes the first remediation/`adk_request_confirmation`; `verify` precedes
`get_service_health`.

```json
{
  "type": "step",
  "run_id": "5f1c2a9e-7d3b-4f0a-9c11-2b6e4d8a1f33",
  "seq": 0,
  "phase": "detect",
  "status": "Pulling open problems from Dynatrace…"
}
```
- `phase` — one of `"detect" | "diagnose" | "act" | "verify"`.
- `status` — short human-readable line for the timeline header.

### 2.2 `tool_call` — the agent called a tool
Source: `run_agent.py:47-48,57-58` — a `part.function_call` (`fc`) whose name is **not**
`adk_request_confirmation`. Covers read-only Dynatrace tools (`list_problems`,
`execute_dql`, `verify_dql`, `get_kubernetes_events`, `list_vulnerabilities`,
`get_environment_info`) and `get_service_health`.

```json
{
  "type": "tool_call",
  "run_id": "5f1c2a9e-7d3b-4f0a-9c11-2b6e4d8a1f33",
  "seq": 2,
  "name": "execute_dql",
  "args": { "query": "fetch events | filter event.kind == \"DEPLOYMENT_EVENT\" and entity.name == \"checkout-api\" | sort timestamp desc | limit 1" }
}
```
- `name` — the tool name (string).
- `args` — the call arguments object (`dict(fc.args)` in `run_agent.py:58`), verbatim.

### 2.3 `tool_result` — a tool returned
Source: `run_agent.py:48,59-60` — a `part.function_response` (`fr`) whose name is **not**
`adk_request_confirmation`. The underlying Dynatrace mock returns JSON strings (see
`autosre/mock_dynatrace/server.py`); the backend SHOULD parse the tool's JSON into
`response` so the UI gets structured data, and SHOULD also provide a one-line `summary`.

```json
{
  "type": "tool_result",
  "run_id": "5f1c2a9e-7d3b-4f0a-9c11-2b6e4d8a1f33",
  "seq": 1,
  "name": "list_problems",
  "summary": "1 open problem: Checkout failure rate spiked to 22% after deploy v2.3.1",
  "response": {
    "problems": [
      {
        "problemId": "P-2026-0042",
        "title": "Checkout failure rate spiked to 22% after deploy v2.3.1",
        "severity": "AVAILABILITY",
        "status": "OPEN",
        "affected_entity": "checkout-api",
        "impacted_metric": "failure_rate",
        "observed_value": 22.0,
        "deploy_version": "2.3.1",
        "active_feature_flags": { "new_payment_gateway": true }
      }
    ],
    "total": 1
  }
}
```
- `name` — the tool name (matches a prior `tool_call.name`).
- `summary` — short string for the timeline.
- `response` — the parsed tool payload. If the tool returned a non-JSON string the
  backend MAY pass it through as `{ "text": "<raw>" }`. The exact field shapes per
  tool are defined by `autosre/mock_dynatrace/server.py` and are identical on a real
  tenant. The UI's **problem card** reads `response.problems[0]`; the **DQL evidence
  panel** reads `response.records` (from `execute_dql`).

### 2.4 `approval_request` — remediation awaiting human approval (THE money shot)
Source: `run_agent.py:49-56` — a `function_call` whose name **is**
`adk_request_confirmation`. The backend lifts the wrapped call out of
`fc.args.originalFunctionCall` and the hint out of `fc.args.toolConfirmation.hint`,
exactly as `run_agent.py:50-55` does. This maps ADK native HITL
(`FunctionTool(require_confirmation=True)`, `autosre/agent/agent.py:70-72`) to a UI card.

```json
{
  "type": "approval_request",
  "run_id": "5f1c2a9e-7d3b-4f0a-9c11-2b6e4d8a1f33",
  "seq": 7,
  "id": "adk-fc-abc123",
  "tool": "toggle_feature_flag",
  "args": { "name": "new_payment_gateway", "enabled": false },
  "hint": "Disable the offending feature flag on checkout-api."
}
```
- `id` — the ADK confirmation function-call id (`fc.id`). **The UI MUST echo this back
  unchanged** in the approval POST (§3). This is the join key for resuming the loop.
- `tool` — the remediation that will run if approved: one of
  `"scale_service" | "rollback_deployment" | "toggle_feature_flag"`.
- `args` — the exact arguments the agent proposed (the UI must render these literally
  in the APPROVE/REJECT card so the operator sees precisely what will happen).
- `hint` — optional human-readable note (may be `""`).
- After this event the stream pauses (no further events) until the UI POSTs a decision.

### 2.5 `approval_resolved` — decision recorded
Emitted by the backend immediately after it receives a valid approval POST (§3) and
before the agent resumes. Lets the UI close the modal and reflect the choice.

```json
{
  "type": "approval_resolved",
  "run_id": "5f1c2a9e-7d3b-4f0a-9c11-2b6e4d8a1f33",
  "seq": 8,
  "id": "adk-fc-abc123",
  "approved": true
}
```
- `id` — matches the `approval_request.id`.
- `approved` — boolean. On `false`, the agent is instructed to stand down (it will not
  retry — see the instruction in `agent.py:49-51`) and will proceed to a `final` event
  explaining the operator declined.

### 2.6 `agent_message` — streamed reasoning text
Source: `run_agent.py:61-62` — the agent's natural-language output. The reference CLI
only surfaces text on `event.is_final_response()`, but intermediate textual parts
(`part.text` on non-final events) are also available and SHOULD be streamed as
`agent_message` to make the reasoning visible live (this is the "visible autonomy"
the demo sells). The terminal text becomes `final` (§2.7), not `agent_message`.

```json
{
  "type": "agent_message",
  "run_id": "5f1c2a9e-7d3b-4f0a-9c11-2b6e4d8a1f33",
  "seq": 5,
  "text": "Root cause: deploy v2.3.1 enabled feature flag 'new_payment_gateway', which throws on AMEX cards — failure rate is 22%.",
  "done": false
}
```
- `text` — a chunk of reasoning. The UI may append chunks with the same logical
  message; `done:false` means more chunks may follow. Backends that don't do
  token-level streaming may emit one `agent_message` per assistant turn with
  `done:true`.

### 2.7 `incident_resolved` / `final` — terminal report
Emitted once at the end of the run. `type` is `"final"`. It carries the agent's closing
report text and the verified health of the service. Source: the final-response text
(`run_agent.py:61-62`) plus a backend read of `checkout-api` `/_internal/state`
(`service_healthy` ⇐ `healthy` field) and/or the remediation tool's
`resolved_incident` flag (`autosre/target_service/main.py:163`).

```json
{
  "type": "final",
  "run_id": "5f1c2a9e-7d3b-4f0a-9c11-2b6e4d8a1f33",
  "seq": 12,
  "report": "Detected a 22% checkout failure rate from deploy v2.3.1. Root cause: feature flag 'new_payment_gateway' throwing on AMEX. Disabled the flag (operator-approved); checkout-api is healthy again.",
  "service_healthy": true,
  "incident_resolved": true,
  "outcome": "resolved"
}
```
- `report` — the closing narrative (string).
- `service_healthy` — boolean, the live health after the loop.
- `incident_resolved` — boolean, whether the injected fault was cleared.
- `outcome` — one of `"resolved" | "all_clear" | "declined" | "unresolved"`.
  - `all_clear` — no problem was found at DETECT.
  - `declined` — operator rejected the remediation; no action taken.
  - `unresolved` — action ran but did not clear the fault (wrong fix).
- The UI flips the incident card to **green** when `service_healthy && incident_resolved`.

> `incident_resolved` is an alias concept; the single terminal event is `type:"final"`.
> There is no separate `incident_resolved` event type — the resolution is conveyed by
> the `incident_resolved` / `outcome` fields on `final`.

### 2.8 `error` — terminal failure
Emitted if the run fails (model error, tool error, target unreachable, rate-limit
exhaustion after backoff). Source: any exception escaping the loop
(`run_agent.py:72-86` already backs off on `429/RESOURCE_EXHAUSTED`; non-retryable or
exhausted-retry errors become this event).

```json
{
  "type": "error",
  "run_id": "5f1c2a9e-7d3b-4f0a-9c11-2b6e4d8a1f33",
  "seq": 4,
  "message": "Model rate-limited and retries exhausted (RESOURCE_EXHAUSTED).",
  "retriable": true
}
```
- `message` — human-readable error for the UI banner. MUST NOT leak secrets/tokens.
- `retriable` — boolean hint for whether a "Retry" affordance makes sense.

### 2.9 Event ordering (typical happy path)

```
step(detect) → tool_call(list_problems) → tool_result(list_problems)
→ step(diagnose) → tool_call(execute_dql) → tool_result(execute_dql)
→ agent_message("root cause …")
→ step(act) → approval_request(toggle_feature_flag)        ← stream pauses here
   …UI POSTs decision…
→ approval_resolved(approved:true)
→ tool_result(toggle_feature_flag)                          ← the action ran
→ step(verify) → tool_call(get_service_health) → tool_result(get_service_health)
→ final(service_healthy:true, incident_resolved:true)
```

---

## 3. The approval round-trip

This is the human-in-the-loop core. It mirrors the `_confirmation_response` pattern in
`autosre/run_agent.py:89-92` exactly.

1. Backend emits `approval_request` (§2.4) with `id` = the ADK confirmation call id.
   The agent loop is **paused** inside the runner; ADK is waiting for a
   `FunctionResponse` named `adk_request_confirmation`.
2. UI renders the APPROVE / REJECT card with `tool`, `args`, `hint`, and BLOCKS the
   operator on a decision (no auto-approve in the demo — the pause IS the product).
3. UI sends:

   `POST /api/incident/{run_id}/approval`
   ```json
   { "confirmation_id": "adk-fc-abc123", "approved": true }
   ```
   - `confirmation_id` — MUST equal the `approval_request.id`. The backend rejects a
     mismatched/stale id with `409`.
   - `approved` — boolean.

   Response `200`:
   ```json
   { "status": "accepted", "confirmation_id": "adk-fc-abc123", "approved": true }
   ```

4. Backend constructs the resume message exactly as `run_agent.py:89-92`:
   ```python
   types.Content(role="user", parts=[types.Part(
       function_response=types.FunctionResponse(
           id=confirmation_id, name="adk_request_confirmation",
           response={"confirmed": approved}))])
   ```
   and feeds it back into `runner.run_async(...)` on the same session. The agent then
   either executes the tool (`approved:true`) or stands down (`approved:false`,
   per the instruction at `agent.py:49-51`).
5. Backend emits `approval_resolved` (§2.5), then continues streaming on the same SSE
   connection (the action's `tool_result`, then verify, then `final`).

Notes:
- Only one approval may be pending per run at a time (the loop is single-threaded).
- If `POST .../approval` arrives with no pending request, return `409`.
- The backend owns the timeout policy; if it times out waiting, it SHOULD emit `error`.

---

## 4. Demo control endpoints

These let the UI drive the whole demo without touching the target service directly.
They proxy `checkout-api`'s admin surface (`autosre/target_service/main.py:128-136`).

### 4.1 `POST /api/demo/inject`
```json
{ "fault": "payment_errors" }
```
- `fault` — one of `"payment_errors" | "latency_spike"`.
- Proxies `POST {TARGET_SERVICE_URL}/_admin/inject {"fault": "<fault>"}`.

Response `200` (passes through the target's response):
```json
{ "injected": "payment_errors", "summary": "Checkout failure rate spiked to 22% after deploy v2.3.1" }
```

Fault → expected correct remediation (for reference; the agent must reason to these —
do not hard-code in the UI, just know what success looks like):
| `fault` | symptom | correct fix the agent should propose |
|---|---|---|
| `payment_errors` | failure_rate 22%, AVAILABILITY | `toggle_feature_flag {name:"new_payment_gateway", enabled:false}` (or `rollback_deployment {version:"2.3.0"}`) |
| `latency_spike` | p99 4200ms, PERFORMANCE | `scale_service {replicas:8}` (any value ≥ 8 resolves) |

### 4.2 `POST /api/demo/reset`
```json
{}
```
- Proxies `POST {TARGET_SERVICE_URL}/_admin/inject {"fault": "clear"}`. Clears any fault.

Response `200`:
```json
{ "injected": null }
```

### 4.3 `GET /api/demo/health`
- Proxies `GET {TARGET_SERVICE_URL}/_internal/state`. Used by the UI to render the
  initial healthy state and to confirm the green recovery state independently of the
  agent's report.

Response `200` (shape from `autosre/target_service/main.py:113-120`):
```json
{
  "version": "2.3.1",
  "replicas": 3,
  "feature_flags": { "new_payment_gateway": true },
  "injected_fault": null,
  "healthy": true,
  "metrics": {
    "service": "checkout-api", "failure_rate": 0.4, "p99_latency_ms": 210,
    "requests_per_min": 1050, "cpu_utilization": 44, "replicas": 3, "version": "2.3.1"
  }
}
```

> **Demo path:** `POST /api/demo/inject` → `POST /api/incident/start` (or pass `inject`
> on `start` to combine) → subscribe to `stream` → operator approves via `approval` →
> watch `final` go green → `POST /api/demo/reset` between takes.

---

## 5. Mode-agnostic guarantee (re-stated, load-bearing)

The agent core (`autosre/agent/*.py`) is **identical** in `mock`, `stdio`, and `remote`
Dynatrace modes; the switch lives entirely in `build_dynatrace_toolset()`. Therefore:

- The event stream, endpoint shapes, and approval round-trip in this contract are the
  same in all three modes. The UI and the deploy config never branch on mode.
- The mock server (`autosre/mock_dynatrace/server.py`) mirrors the real tool surface,
  so `tool_result.response` shapes are stable whether telemetry is mocked or live.
- For the demo, detect/diagnose may run against a real tenant (`remote`) and act/verify
  against `mock` for reliability — but that is a deploy/env decision, invisible to this
  contract.

---

## 6. Tasks this implies for Agent-Core (Workstream B)

These are the agent-core changes required to satisfy this contract (the contract itself
defines them; B implements):

1. Add an HTTP layer (FastAPI or `adk api_server` routes) exposing the six endpoints in §1.
2. Per-run session management keyed by `run_id` over the existing `InMemoryRunner`.
3. An adapter that consumes `runner.run_async(...)` events (the loop in
   `run_agent.py:35-63`) and emits the §2 typed SSE frames, including the phase
   classification for `step`.
4. The pause/resume bridge: hold the loop on `approval_request`, accept the POST,
   rebuild the `_confirmation_response` (`run_agent.py:89-92`), resume.
5. Proxy routes for the demo-control endpoints (§4) to `TARGET_SERVICE_URL`.
6. CORS configured for the UI origin (`ARCHITECTURE.md`).
7. Preserve the 429 backoff already in `_run_turn_resilient` (`run_agent.py:72-86`);
   surface exhaustion as an `error` event.
