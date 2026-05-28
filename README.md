# AutoSRE — autonomous incident response, with you in the loop

**Track: Dynatrace** · Built with **Gemini 3** on **Google Cloud Agent Development Kit (ADK)** · Partner superpower via the **Dynatrace MCP server**.

AutoSRE is an agent that does what an on-call engineer does at 3am — but it asks
before it touches production. It **detects** an incident from Dynatrace,
**diagnoses** the root cause from live telemetry, **proposes** exactly one fix,
waits for a **human's approval**, **executes** the remediation, and **verifies**
the service recovered.

> Most observability agents stop at "answer questions about my dashboards."
> AutoSRE closes the loop: it takes the action that resolves the incident —
> under your oversight.

---

## Why this fits the challenge

| Requirement | How AutoSRE meets it |
|---|---|
| **Beyond chat — uses tools to accomplish tasks** | Calls Dynatrace MCP tools to investigate, then calls remediation tools that change real service state (scale / rollback / feature-flag). |
| **Multi-step mission with planning** | Runs a 6-step loop: detect → diagnose → propose → approve → act → verify. The model plans which DQL to run and which single remediation resolves the diagnosed cause. |
| **Keeps the human in control** | A Python-enforced approval gate blocks every mutating action until a human approves the specific proposed plan. The model cannot bypass it. |
| **Meaningful partner integration (MCP)** | Dynatrace is the agent's senses. Detection and diagnosis are driven entirely by Dynatrace MCP tools (`list_problems`, `execute_dql`, `get_kubernetes_events`, `list_vulnerabilities`). |
| **Gemini 3 + Google Cloud Agent Builder** | Implemented on ADK (the code-first path of Google Cloud's Agent Platform), reasoning on `gemini-3-pro-preview`, deployable to Cloud Run / Vertex AI. |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  AutoSRE Agent  (ADK LlmAgent · gemini-3-pro-preview)              │
│                                                                    │
│  Toolset 1 — Dynatrace MCP   (DETECT + DIAGNOSE, read-only)        │
│     list_problems · execute_dql · get_kubernetes_events            │
│     list_vulnerabilities · get_environment_info                    │
│                                                                    │
│  Toolset 2 — Remediation     (ACT, human-gated)                    │
│     propose_remediation ──▶ [HUMAN APPROVES] ──▶ scale_service /   │
│     rollback_deployment / toggle_feature_flag · get_service_health │
│                                                                    │
│  before_tool_callback = approval_gate  (enforces HITL in Python)   │
└──────────────────────────────────────────────────────────────────┘
        │ acts on                                  ▲ observes
        ▼                                          │
  ┌────────────────────┐      telemetry     ┌──────────────────────┐
  │ checkout-api        │ ─────────────────▶ │ Dynatrace MCP        │
  │ (demo target svc,   │                    │  mock  (offline) OR  │
  │  injectable faults) │                    │  real tenant gateway │
  └────────────────────┘                    └──────────────────────┘
```

Three swappable Dynatrace backends behind one identical tool interface
(`DYNATRACE_MCP_MODE`):

- **`mock`** — bundled offline server; run the whole demo with zero accounts.
- **`stdio`** — the official `npx @dynatrace-oss/dynatrace-mcp-server`, run locally.
- **`remote`** — your Dynatrace tenant's hosted MCP gateway (HTTP + Bearer token).

The agent code never changes between them.

---

## Repository layout

```
autosre/
  agent/
    agent.py         # the ADK LlmAgent + system prompt (the 6-step loop)
    dynatrace.py     # builds the Dynatrace MCP toolset (mock/stdio/remote)
    remediation.py   # remediation tools + the human-approval gate
  mock_dynatrace/
    server.py        # offline Dynatrace MCP server (same tool names as real)
  target_service/
    main.py          # checkout-api: the service the agent observes & fixes
  run_agent.py       # interactive CLI runner (primary demo entry point)
tests/               # deterministic machinery tests + a live end-to-end test
deploy/              # Dockerfiles + Cloud Run deploy script
DEMO.md              # 3-minute demo runbook
SUBMISSION.md        # Devpost requirement → evidence mapping
```

---

## Quickstart (fully offline, no accounts needed)

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # defaults to DYNATRACE_MCP_MODE=mock

# 1) start the demo target service
python -m autosre.target_service.main          # serves on :8081

# 2) (new shell) inject an incident
curl -X POST localhost:8081/_admin/inject \
     -H 'content-type: application/json' -d '{"fault":"payment_errors"}'

# 3) add a Gemini key to .env, then run the agent
#    GOOGLE_API_KEY=...  (free from Google AI Studio — no GCP billing needed)
python -m autosre.run_agent
```

You'll watch the agent list the problem, run DQL to find the bad deploy/flag,
propose disabling the flag, pause for your approval, execute it, and confirm
`checkout-api` is healthy again.

Available faults: `payment_errors` (fix: disable feature flag or roll back) and
`latency_spike` (fix: scale replicas).

> **Model & quota note.** `gemini-3-flash-preview` (the default) runs on the free
> Google AI Studio tier — but the free tier allows only ~5 requests/minute, and a
> full incident loop makes several model calls. The runner automatically backs off
> and resumes when rate-limited, so it still completes (just pauses briefly). For a
> smooth demo, enable billing on the project (or use Vertex AI) and switch to
> `AUTOSRE_MODEL=gemini-3-pro-preview` for stronger reasoning.

### Visual UI (great for the demo)

```bash
# from the repo root (so .env is picked up); then open http://127.0.0.1:8000
adk web autosre/agent
```

In the web UI, ask the agent to "run an incident sweep on checkout-api". When it
decides on a fix, ADK shows a native **approve / reject** button for the
remediation — that's the human-in-the-loop step, enforced by the framework.

Or launch the target service + web UI together:

```bash
bash scripts/start_demo.sh
```

---

## Run against real Dynatrace

1. Create a Dynatrace trial tenant and a **Platform token** with scopes
   `mcp-gateway:servers:invoke`, `mcp-gateway:servers:read`, and the
   `storage:*:read` scopes you need.
2. In `.env`:
   ```
   DYNATRACE_MCP_MODE=remote
   DT_ENVIRONMENT=https://YOUR-TENANT.apps.dynatrace.com
   DT_PLATFORM_TOKEN=dt0s16....
   ```
3. Run the agent exactly as above. To use the official local server instead of
   the hosted gateway, set `DYNATRACE_MCP_MODE=stdio` (requires Node/`npx`).

---

## Deploy to Google Cloud Run

```bash
export PROJECT_ID=your-project REGION=us-central1
export DT_ENVIRONMENT=https://YOUR-TENANT.apps.dynatrace.com
export DT_PLATFORM_TOKEN=dt0s16....
bash deploy/deploy_cloud_run.sh
```

This deploys `checkout-api` and the `autosre` agent (served via `adk api_server`,
reasoning on Gemini 3 through Vertex AI).

---

## Tests

```bash
pytest          # 11 deterministic tests (machinery) + 1 live test
```

The deterministic tests boot the real target service, drive the **mock Dynatrace
MCP server over the real MCP stdio protocol**, and verify the approval gate and
that the right remediation resolves each incident. The live test
(`tests/test_agent_live.py`) runs the full Gemini loop end-to-end and is skipped
unless Gemini credentials are present.

---

## License

MIT — see [LICENSE](LICENSE).
