# AutoSRE Devpost Submission (Draft)

## Project Name
**AutoSRE: The Autonomous On-Call Engineer**

---

## Elevator Pitch (≤ 1 sentence)

AutoSRE detects production incidents from Dynatrace, diagnoses the root cause from live telemetry with Gemini 3 reasoning, proposes a fix, waits for your one-tap approval, executes it, and verifies recovery, collapsing incident MTTR from 30+ minutes to seconds, with a human gating every action.

---

## What It Does

AutoSRE is an autonomous incident-response agent built on **Google Cloud's Agent Platform (Agent Development Kit)**, reasoning on **Gemini 3 via Vertex AI**, and powered entirely by the **Dynatrace MCP** as its observability source.

The agent runs a **6-step loop**:

1. **DETECT**: Pull open problems from Dynatrace (anomalies, threshold violations, deployment events).
2. **DIAGNOSE**: Run DQL queries to correlate the problem with recent changes (feature flags, deployments, config).
3. **PROPOSE**: Reason about the root cause and name exactly one remediation (disable flag, rollback, scale service).
4. **PAUSE**: Block until a human approves the proposed action (ADK-native `require_confirmation=True`, not a prompt).
5. **ACT**: Execute the approved remediation.
6. **VERIFY**: Re-check service health and confirm recovery.

**The core value proposition:** Compress incident diagnosis from 30+ minutes of manual triage to ~10 seconds of automated analysis, while keeping a human as the accountable decision-maker. The agent does the 3am grunt work; the operator just approves the fix.

**The web UI:** A dark ops "Mission Control" dashboard streams the loop live over SSE. The operator watches the agent pull the Dynatrace problem, run evidence queries, propose the fix, and then taps **APPROVE** to execute. The incident card flips green on recovery.

**Key differentiators:**
- **Dynatrace MCP is load-bearing:** the agent's only sensory system for detect and diagnose. Not ornamental.
- **Human-in-the-loop is framework-enforced:** ADK `require_confirmation=True` is built into the remediation tool definition. The model cannot bypass it.
- **Mode-agnostic guarantee:** The agent code is identical across `DYNATRACE_MCP_MODE=mock | stdio | remote`. Offline (mock), local (official MCP server), or against a real tenant, the UI and events are byte-identical.

---

## How We Built It

### Tech Stack & Architecture

- **Reasoning engine:** Gemini 3 via **Vertex AI** (`gemini-3-flash-preview` by default for cost and speed; `gemini-3-pro-preview` for maximum reasoning).
- **Agent framework:** **Google Cloud's Agent Development Kit (ADK)**, the code-first surface of **Agent Builder / Agent Platform**. Deployed to **Vertex AI Agent Engine** (the managed Agent Platform runtime).
- **Observability partner:** **Dynatrace MCP server** (official `@dynatrace-oss/dynatrace-mcp-server` or hosted remote gateway). Tools: `query_problems`, `execute_dql`, `get_events_for_kubernetes_cluster` (read-only, for detect, diagnose, and recovery confirmation). Underscore names satisfy Gemini's function-calling; the toolset also accepts a real gateway's hyphenated names.
- **Remediation tools:** Python `FunctionTool` with `require_confirmation=True` (human-gated): `toggle_feature_flag`, `scale_service`, `rollback_deployment`, `get_service_health`.
- **Web UI:** Next.js 16 (App Router), Tailwind CSS v4, TypeScript. Streams SSE events and renders real-time timeline + approval modal.
- **Backend:** FastAPI HTTP + SSE service. Per-run session management, pause/resume bridge for approval round-trip.
- **Target service:** FastAPI `checkout-api` with injectable faults (payment errors, latency spike) and state introspection (`/_internal/state`).
- **Deployment:** Docker containers on Google Cloud Run (agent, checkout-api, web UI) + Vertex AI Agent Engine registration.

### Key Design Decisions

1. **ADK-native HITL over prompt instruction:** The approval gate is a `FunctionTool(require_confirmation=True)` definition, not a system-prompt hack. The model cannot call the remediation tool without explicit human confirmation. This is stronger than any instruction.

2. **Streaming events contract:** All comms between agent and UI are typed JSON SSE frames (9 event types: `step`, `tool_call`, `tool_result`, `approval_request`, `approval_resolved`, `agent_message`, `final`, `error`). This enables the web UI to render the agent's reasoning in real time.

3. **Mode-agnostic guarantee:** Dynatrace toolset is abstracted behind a factory function (`build_dynatrace_toolset(mode)`). `mock` mode runs a bundled MCP server (derives telemetry from the target service's state). `stdio` and `remote` modes point to the official server. The agent code is identical in all three; only env vars change.

4. **No other AI models:** Only Google Cloud AI (Gemini) + Dynatrace's built-in AI (Davis). No other LLMs, no retrieval, no fine-tuning.

---

## Challenges

1. **Dynatrace MCP availability:** The official `@dynatrace-oss/dynatrace-mcp-server` was not available early; we built a deterministic mock MCP server with identical tool shapes to unblock development. This proved to be a feature: the `mock` mode is now a reliable fallback for offline demos.

2. **SSE streaming + approval pause:** Holding an SSE stream open while pausing for human input required careful session management. Solution: per-run state machine in `autosre/server/` tracks pending approvals and resumes the loop on decision POST.

3. **Gemini rate-limiting on free tier:** `gemini-3-flash-preview` (free) allows ~5 req/min. A full incident loop makes 4-5 model calls. Solution: exponential backoff + retry in `run_agent.py`. For demo smoothness, use a free API key (no billing) or enable billing for higher quota.

4. **Mode-agnostic testing:** Ensuring the agent behaves identically in `mock`, `stdio`, and `remote` modes required a unified toolset interface. Solution: `FunctionTool` list is built dynamically; tool names and response shapes are tested against the contract.

5. **CORS between Cloud Run instances:** The UI and agent run on different Cloud Run domains. Solution: explicit `ALLOWED_ORIGIN` env var with CORS headers on SSE and POST endpoints.

---

## What's Next

- **Multi-incident concurrency:** Currently supports one run per operator session. Extend to parallel incident tracking.
- **Incident history & audit trail:** Store resolved incidents for post-mortem and compliance.
- **Deeper Dynatrace integration:** Use Davis AI for richer problem context; correlate with change events, SLO violations, and custom metrics.
- **More remediation types:** Extend beyond flags/rollback/scale to config changes, canary rollbacks, and upstream circuit-breaker trips.
- **Slack / PagerDuty integration:** Alert escalation and approval via native chat / on-call tools.
- **Real Kubernetes cluster:** Demo against a live k8s cluster instead of a mock checkout-api.
- **Android / iOS native app:** Currently web-only; add native mobile interfaces for SREs on-the-go.

---

## Selected Track

**Dynatrace.** The agent is entirely powered by Dynatrace MCP for observability. Dynatrace Davis (built-in AI) is named as a partner superpower; the Dynatrace MCP is the load-bearing observability source.

---

## Devpost Form Fields (Summary)

| Field | Content |
|-------|---------|
| **Project Name** | AutoSRE: The Autonomous On-Call Engineer |
| **Tagline** | The on-call engineer that diagnoses and fixes production incidents from Dynatrace, but never acts without your approval. |
| **Demo video** | [YouTube URL] (≤3:00, shows full DETECT→DIAGNOSE→APPROVE→ACT→VERIFY loop) |
| **Try it** | **https://autosre-ui-vrf7h4n4ra-uc.a.run.app/demo** — works from incognito. The hosted Mission Control runs the **real Gemini agent live** end to end (deterministic mock telemetry for a reliable click-through), streaming DETECT→DIAGNOSE→APPROVE→ACT→VERIFY, with the approved remediation executing for real against checkout-api. The same agent's run against a **real Dynatrace tenant** (real DQL returning the incident over the official Dynatrace MCP server) is shown in the demo video and is reproducible locally (`DYNATRACE_MCP_MODE=stdio`). |
| **Code** | https://github.com/thylinao1/autosre (open-source MIT). License visible in About box. |
| **Inspiration** | IT downtime costs thousands per minute (Gartner's 2014 figure: $5,600/min; EMA Research 2024: ~$14,056/min); MTTR is dominated by the identify phase (30+ min). AutoSRE collapses triage to seconds. |
| **What it does** | (See section above) |
| **How we built it** | (See section above) |
| **Challenges** | (See section above) |
| **Accomplishments** | Full 6-step loop deployed and tested. SSE streaming + approval pause proven on web UI. ADK-native HITL enforced. Mode-agnostic Dynatrace toolset (mock/stdio/remote). 30 tests (28 deterministic offline, 2 live-gated). Deployed to Vertex AI Agent Engine + Cloud Run. |
| **What we learned** | The approval pause is the product, not a bug. Framework-enforced human gates are stronger than prompt tricks. Dynatrace MCP is a powerful observability abstraction; the mock mode we built is as valuable as the remote. |
| **Built with** | Google Cloud (Vertex AI, Agent Development Kit, Cloud Run, Secret Manager), Dynatrace MCP, Gemini 3, Next.js, FastAPI, Python, TypeScript |
| **Track** | Dynatrace |
| **Team** | [Your name/team] |

---

## Submission Checklist

- [ ] **Hosted live URL:** Cloud Run Mission-Control UI that works from incognito (Stage-1 requirement).
- [ ] **Public GitHub repo:** `public` visibility; MIT license auto-detected in About box.
- [ ] **~3 minute demo video:** Shows the full 6-step loop. Criterion-tagged (Tech / Design / Impact / Idea). Audio narration of the real-world pain stat ($5,600/min) and the value prop (30+ min → ~1 min).
- [ ] **Devpost form:** All fields filled. Track selected: Dynatrace.
- [ ] **Reproducibility:** Judges can clone the repo, set `GOOGLE_API_KEY=...` (free from Google AI Studio) and `DYNATRACE_MCP_MODE=mock`, and run the full demo offline in <5 minutes.
- [ ] **No leaked secrets:** `.env` is gitignored. No hardcoded API keys, tokens, or project IDs in the codebase.
- [ ] **Tech claims verified:** README and video name the exact tools: Gemini 3, Agent Development Kit (ADK), Vertex AI Agent Engine, Dynatrace MCP, SSE, Cloud Run. All claims match the working code.

---

## Impact Metrics (Evidence for Judges)

| Metric | Value | Evidence |
|--------|-------|----------|
| **Real-world pain quantified** | Gartner 2014: $5,600/min; EMA 2024: ~$14,056/min; identify phase 30+ min | README opening (sourced); video narration |
| **MTTR improvement** | 30+ min → ~1 min (detect + diagnose) | Live video demo, timed beat |
| **Incident types handled** | 2 (payment-flag, latency-scale) | DEMO.md; test suite (30 tests, both fault paths covered) |
| **Uptime for demo** | 100% (mock mode) | `DYNATRACE_MCP_MODE=mock` is offline-deterministic |
| **Real-tenant validation** | Supports `remote` mode (production Dynatrace tenant) | ARCHITECTURE.md; tested during dev |
| **Framework-enforced safety** | ADK `require_confirmation=True` | `autosre/agent/agent.py` (the three remediation tools are wrapped `FunctionTool(..., require_confirmation=True)`); tested in `test_remediation_gate.py` |
| **Deployment path** | Vertex AI Agent Engine + Cloud Run | `deploy/deploy_cloud_run.sh`; one-liner `make deploy` (pending final Workstream C) |

---

## Judging Alignment

**Technological Implementation (25%)**
- ✅ Gemini 3 reasoning on ADK (Agent Development Kit): the code-first path of Google Cloud's Agent Platform.
- ✅ Dynatrace MCP is the only sensory system (detect + diagnose); load-bearing, not ornamental.
- ✅ ADK-native human-in-the-loop (`require_confirmation=True`): framework-enforced, stronger than prompt instruction.
- ✅ Mode-agnostic guarantee: identical agent across mock/stdio/remote.

**Design (25%)**
- ✅ Mission Control UI: dark ops aesthetic, streaming timeline, hero approval card, recovery animation.
- ✅ Real-time SSE streaming makes autonomy visible (judges see the agent thinking live).
- ✅ Responsive design (1440/768/375).
- ✅ No AI-slop; intentional, specific design direction.

**Potential Impact (25%)**
- ✅ Quantified pain: $5,600/min IT downtime (Gartner); identify phase 30+ min.
- ✅ Clear target users: on-call SREs, DevOps, retail/financial ops.
- ✅ Deployment path: Cloud Run + Vertex AI Agent Engine (no custom infrastructure).
- ✅ Generalizable loop: works for any incident type with appropriate observability + remediation tools.

**Quality of the Idea (25%)**
- ✅ Sharp, differentiated framing: "Autonomous, but on your authority."
- ✅ Solves a real SRE problem: incident response at scale, with accountability.
- ✅ Human-gated autonomy is the differentiator (vs. chatbots or reckless auto-fix).
- ✅ Memorable one-liner: *"the on-call engineer that never touches prod without your approval."*

---

## Final Notes

- **Judges will open the live URL and click it.** Ensure it works from incognito, cold load.
- **Judges will read the README.** Lead with the downtime-cost stat and architecture diagram.
- **Judges will watch the ~3-min video.** Make the approval moment the emotional peak.
- **Judges will open the code.** Ensure Dynatrace MCP usage is obvious; ensure `require_confirmation` gate is not removed.
- **Track selection matters.** We are racing other Dynatrace entries, not all 150+ hackathon entries. A finished, polished, on-theme submission with genuine central MCP use is a realistic medal.
