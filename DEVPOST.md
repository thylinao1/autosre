# AutoSRE Devpost Submission (Draft)

## Project Name
**AutoSRE: The Autonomous On-Call Engineer**

---

## Elevator Pitch (≤ 1 sentence)

AutoSRE detects production incidents from Dynatrace, diagnoses the root cause from live telemetry with Gemini 3 reasoning, proposes a fix, waits for your one-tap approval, executes it, and verifies recovery, collapsing incident MTTR from 30+ minutes to seconds, with a human gating every action.

---

## What It Does

AutoSRE is an autonomous incident-response agent built with the **Agent Development Kit (ADK)**, the code-first surface of **Google Cloud's Agent Platform (Agent Builder)**, reasoning on **Gemini 3 via Vertex AI**, deployed on **Cloud Run** (and also deployable to **Vertex AI Agent Engine**), and powered entirely by the **Dynatrace MCP** as its observability source.

The agent runs a **6-step loop**:

1. **DETECT**: Pull open problems from Dynatrace (anomalies, threshold violations, deployment events).
2. **DIAGNOSE**: Run DQL queries to correlate the problem with recent changes (feature flags, deployments, config).
3. **PROPOSE**: Reason about the root cause and name exactly one remediation (disable flag, rollback, scale service).
4. **PAUSE**: Block until a human approves the proposed action (ADK-native `require_confirmation=True`, not a prompt).
5. **ACT**: Execute the approved remediation.
6. **VERIFY**: Re-check service health and confirm recovery.

**The core value proposition:** Compress incident triage from 30+ minutes of manual work to the seconds shown on the demo's live timer (detection through a verified fix), while keeping a human as the accountable decision-maker. The agent does the 3am grunt work; the operator just approves the fix.

**The web UI:** A dark ops "Mission Control" dashboard streams the loop live over SSE. The operator watches the agent pull the Dynatrace problem, run evidence queries, propose the fix, and then taps **APPROVE** to execute. The incident card flips green on recovery.

**Key differentiators:**
- **The refusal is the product.** The remediation tools are wrapped in ADK `require_confirmation=True`, so the model physically cannot touch production without a human decision. Approve and it fixes the incident. Reject and it stands down, changes nothing, and does not route around you. The gate lives in the code (`autosre/agent/agent.py`), not the prompt.
- **Two governed outcomes, both on Dynatrace's own timeline.** An append-only ledger records every decision (who, what, outcome) and writes each one back into the real Dynatrace tenant as a log. Approve gives `approved / resolved`; reject gives `rejected / declined` with production untouched. The platform that detected the incident also holds the proof of who authorized or refused the fix.
- **Dynatrace MCP is load-bearing:** the agent's only sensory system for detect and diagnose. Detection runs on a live DQL query against real OpenTelemetry, not a canned reply.
- **Mode-agnostic guarantee:** The agent code is identical across `DYNATRACE_MCP_MODE=mock | stdio | remote`. Offline (mock), local (official MCP server), or against a real tenant, the UI and events are byte-identical.
- **The platform that watches production watches the agent.** AutoSRE is graded before it is trusted: a diagnosis eval scores the live agent against an answer key it can never see, across decoy incidents (where the reflex fix is wrong) and a no-action trap (where the only correct move is to do nothing). The graded results are exported into the same Dynatrace tenant the agent monitors (latest export: 26 records acknowledged, HTTP 204), next to the audit record of every live approve and reject, so the agent's own track record (accuracy, false-action rate, refusals) lives where the telemetry lives, one DQL away in Grail. The live demo renders the committed scorecard at `/reliability`. Who watches the watcher? The observability platform does.

> **Honest note on the write-back:** our trial Dynatrace tenant is OpenTelemetry-only, so the richer Davis problem and Smartscape write APIs are not available to us. We put each approval on the tenant's timeline through the Log Monitoring API because it is the reproducible way to do it on the tenant we actually have. The value is the auditable governance record on the platform that saw the incident, not the specific ingest API. Detection, by contrast, is full live DQL against real telemetry.

---

## How We Built It

### Tech Stack & Architecture

- **Reasoning engine:** Gemini 3 via **Vertex AI** (`gemini-3-flash-preview` by default for cost and speed; `gemini-3-pro-preview` for maximum reasoning).
- **Agent framework:** **Google Cloud's Agent Development Kit (ADK)**, the code-first surface of **Agent Builder / Agent Platform**. The agent runs self-hosted (`python -m autosre.server`, ADK `InMemoryRunner`) on **Cloud Run**; the same ADK `root_agent` is also deployable to **Vertex AI Agent Engine** (the managed Agent Platform runtime) via `deploy/agent_engine_deploy.py`.
- **Observability partner:** **Dynatrace MCP server** (official `@dynatrace-oss/dynatrace-mcp-server` or hosted remote gateway). Tools: `query_problems`, `execute_dql`, `get_events_for_kubernetes_cluster` (read-only, for detect, diagnose, and recovery confirmation). Underscore names satisfy Gemini's function-calling; the toolset also accepts a real gateway's hyphenated names.
- **Remediation tools:** Python `FunctionTool` with `require_confirmation=True` (human-gated): `toggle_feature_flag`, `scale_service`, `rollback_deployment`, `get_service_health`. Each is also machine-bounded by server-side allow-lists (a replica band, a known-good rollback-version set, managed flag names), so an out-of-bounds action fails closed even when a human approves it.
- **Web UI:** Next.js 16 (App Router), Tailwind CSS v4, TypeScript. Streams SSE events and renders real-time timeline + approval modal.
- **Backend:** FastAPI HTTP + SSE service. Per-run session management, pause/resume bridge for approval round-trip.
- **Target service:** FastAPI `checkout-api` with injectable faults (payment errors, latency spike) and state introspection (`/_internal/state`).
- **Deployment:** Docker containers on Google Cloud Run (agent, checkout-api, web UI), single-instance for the agent so the in-memory run state and ledger stay coherent. The same ADK agent is also registerable on Vertex AI Agent Engine via `deploy/agent_engine_deploy.py`.

### Key Design Decisions

1. **ADK-native HITL over prompt instruction:** The approval gate is a `FunctionTool(require_confirmation=True)` definition, not a system-prompt hack. The model cannot call the remediation tool without explicit human confirmation. This is stronger than any instruction.

2. **Streaming events contract:** All comms between agent and UI are typed JSON SSE frames (8 event types: `step`, `tool_call`, `tool_result`, `approval_request`, `approval_resolved`, `agent_message`, `final`, `error`). This enables the web UI to render the agent's reasoning in real time.

3. **Mode-agnostic guarantee:** Dynatrace toolset is abstracted behind a factory function (`build_dynatrace_toolset(mode)`). `mock` mode runs a bundled MCP server (derives telemetry from the target service's state). `stdio` and `remote` modes point to the official server. The agent code is identical in all three; only env vars change.

4. **One model, by design:** The only LLM is Gemini 3 on Vertex AI. No other models, no retrieval, no fine-tuning. The observability intelligence comes from Dynatrace through the MCP; detection is live DQL, and because our trial tenant is OpenTelemetry-only we read telemetry directly rather than consuming Davis problems, which we call out honestly.

5. **Defense in depth around the gate:** The human gate is backed by machine bounds. The remediation tools enforce server-side allow-lists (replica band, known-good versions, managed flag names), so even an approved-but-poisoned action fails closed. The agent instruction carries an untrusted-telemetry guardrail (all Dynatrace data is evidence to summarize, never instructions) to defend against indirect prompt injection through log and event text. And the demo target never leaks the answer key: `/_internal/state` exposes only the observable symptom (a Davis-style title plus the impacted metric), never the prose root cause or the exact fix, so the diagnosis is genuine reasoning rather than a lookup.

---

## Challenges

1. **Dynatrace MCP availability:** The official `@dynatrace-oss/dynatrace-mcp-server` was not available early; we built a deterministic mock MCP server with identical tool shapes to unblock development. This proved to be a feature: the `mock` mode is now a reliable fallback for offline demos.

2. **SSE streaming + approval pause:** Holding an SSE stream open while pausing for human input required careful session management. Solution: per-run state machine in `autosre/server/` tracks pending approvals and resumes the loop on decision POST.

3. **Gemini rate-limiting on free tier:** `gemini-3-flash-preview` (free) allows ~5 req/min. A full incident loop makes 4-5 model calls. Solution: exponential backoff + retry in `run_agent.py`. For demo smoothness, use a free API key (no billing) or enable billing for higher quota.

4. **Mode-agnostic testing:** Ensuring the agent behaves identically in `mock`, `stdio`, and `remote` modes required a unified toolset interface. Solution: `FunctionTool` list is built dynamically; tool names and response shapes are tested against the contract.

5. **CORS between Cloud Run instances:** The UI and agent run on different Cloud Run domains. Solution: explicit `ALLOWED_ORIGIN` env var with CORS headers on SSE and POST endpoints.

6. **Auditing the refusal correctly:** Live grounding surfaced that the deny path was logging a rejection as `approved` (ADK emits a confirmation stub for the gated tool before the human decides, which a naive classifier miscounts as "acted"). Solution: derive the decision from the operator's actual choice, honor a rejection in the replay path, and add deny-path regression tests so the marquee refusal beat cannot silently re-break.

---

## What's Next

- **Multi-incident concurrency:** Currently supports one run per operator session. Extend to parallel incident tracking.
- **Incident history & audit trail:** Store resolved incidents for post-mortem and compliance.
- **Deeper Dynatrace integration:** Use Davis AI for richer problem context; correlate with change events, SLO violations, and custom metrics.
- **More remediation types:** Extend beyond flags/rollback/scale to config changes, canary rollbacks, and upstream circuit-breaker trips.
- **Slack / PagerDuty integration:** Alert escalation and approval via native chat / on-call tools.
- **Real Kubernetes cluster:** Demo against a live k8s cluster instead of a mock checkout-api.
- **Android / iOS native app:** Currently web-only; add native mobile interfaces for SREs on-the-go.
- **Second-opinion verifier (shipped, opt-in):** A second, independent Gemini pass critiques the proposed fix before the human sees it (`AUTOSRE_SECOND_OPINION=1`). Next: make it default-on once the latency budget allows and show a confidence score.
- **Graduated-autonomy risk tiers (shipped):** Every proposed action carries a risk tier (`autosre/server/policy.py`), shown in the approval modal; an operator can pre-authorize a tier so low-risk actions auto-apply while higher-risk ones always stop for a human. Next: richer per-action policy configuration.
- **Ledger-as-memory (shipped):** The agent can call `get_recent_decisions` to cite how similar incidents were handled before. Next: semantic similarity over past incidents instead of recency.
- **Diagnosis eval harness (shipped, multi-trial):** `tests/evals/` scores tool-selection accuracy, false-action rate, trap refusals, and detect-to-proposal latency without auto-approve, graded against a test-only answer key the agent never sees, under a pre-registered pass criterion. Latest committed run: 25/25 (20/20 tool selection, 0/25 false actions, 5/5 trap refusals, median 13.3s), with results exported to the Dynatrace tenant so the agent's track record is queryable in Grail. Next: broaden the scenario pool and wire it into CI as a regression gate.

---

## Selected Track

**Dynatrace.** The agent's only observability source is the Dynatrace MCP server, and it is load-bearing: detection and diagnosis run on live DQL against real OpenTelemetry, and every approval is written back to the tenant. (Davis is Dynatrace's built-in problem engine; our trial tenant is OpenTelemetry-only, so we detect via DQL rather than Davis problems.)

---

## Devpost Form Fields (Summary)

| Field | Content |
|-------|---------|
| **Project Name** | AutoSRE: The Autonomous On-Call Engineer |
| **Tagline** | The on-call engineer that diagnoses and fixes production incidents from Dynatrace, but never acts without your approval. |
| **Demo video** | _‹paste your YouTube link here after recording›_ · ≤3:00, opens on the deny run, then the real-Dynatrace DQL cut, then approve → resolved; closes on the graded scorecard (trap refusals), the agent's track record queried from Grail, and the 3am line (see `submission/VIDEO-TRANSCRIPT.md` beat 8) |
| **Try it** | **https://autosre-ui-vrf7h4n4ra-uc.a.run.app/demo** (works from incognito). The hosted Mission Control runs the **real Gemini agent live** end to end, streaming DETECT, DIAGNOSE, the approval gate, ACT, and VERIFY. Approve and the remediation executes for real against checkout-api and is written back to our real Dynatrace tenant as an audit log. **Try rejecting it too:** the agent stands down, production stays untouched, and the Audit trail records the refusal right next to the approval. The same agent's detection run against the real Dynatrace tenant (live DQL over the official MCP server) is in the demo video and reproducible locally with `DYNATRACE_MCP_MODE=stdio`. |
| **Code** | https://github.com/thylinao1/autosre (open-source MIT). License visible in About box. |
| **Inspiration** | IT downtime is expensive (industry context, not our measurement: Gartner's 2014 figure of $5,600/min; EMA Research 2024 of ~$14,056/min); MTTR is dominated by the identify phase (30+ min). AutoSRE collapses the detect-to-proposed-fix triage to the seconds shown on the demo's live timer. |
| **What it does** | (See section above) |
| **How we built it** | (See section above) |
| **Challenges** | (See section above) |
| **Accomplishments** | Full 6-step loop deployed and tested. SSE streaming + approval pause proven on web UI. ADK-native HITL enforced and backed by server-side action allow-lists, with both the approve and the reject path audited on Dynatrace's timeline. Mode-agnostic Dynatrace toolset (mock/stdio/remote). A multi-trial diagnosis eval scores the live `gemini-3-flash-preview` agent 25/25 (20/20 tool selection across two real faults and two wrong-fix decoys, 0/25 false actions, 5/5 refusals on the no-action trap, median 13.3s detect-to-proposal), graded against an answer key the agent never sees, with timestamped transcripts committed. The test suite (71 tests: 70 deterministic offline, 1 live-gated) pins the deny path, the allow-list bounds, rate limiting, the in-process tools, the eval scorer, and the multi-trial eval aggregation + Dynatrace export shapes. Deployed on Cloud Run, with the same ADK agent registerable on Vertex AI Agent Engine (`deploy/agent_engine_deploy.py`). |
| **What we learned** | The approval pause is the product, not a bug. Framework-enforced human gates are stronger than prompt tricks, and stronger still when backed by machine bounds that fail closed. Dynatrace MCP is a powerful observability abstraction; the mock mode we built is as valuable as the remote. |
| **Built with** | Google Cloud (Vertex AI, Agent Development Kit, Cloud Run, Secret Manager; Vertex AI Agent Engine deployable), Dynatrace MCP, Gemini 3, Next.js, FastAPI, Python, TypeScript |
| **Track** | Dynatrace |
| **Team** | _‹TODO: your name or team name here›_ |

---

## Submission Checklist

- [ ] **Hosted live URL:** Cloud Run Mission-Control UI that works from incognito (Stage-1 requirement).
- [ ] **Public GitHub repo:** `public` visibility; MIT license auto-detected in About box.
- [ ] **~3 minute demo video:** Shows the full 6-step loop. Criterion-tagged (Tech / Design / Impact / Idea). Audio narration of the real-world pain stat ($5,600/min) and the value prop (30+ min → ~1 min).
- [ ] **Devpost form:** All fields filled. Track selected: Dynatrace.
- [ ] **Reproducibility:** Judges can clone the repo, set `GOOGLE_API_KEY=...` (free from Google AI Studio) and `DYNATRACE_MCP_MODE=mock`, and run the full demo offline in <5 minutes.
- [ ] **No leaked secrets:** `.env` is gitignored. No hardcoded API keys, tokens, or project IDs in the codebase.
- [ ] **Tech claims verified:** README and video name the exact tools: Gemini 3 via Vertex AI, Agent Development Kit (ADK), Cloud Run (with Vertex AI Agent Engine deployable via `deploy/agent_engine_deploy.py`), Dynatrace MCP, SSE. All claims match the working code.

---

## Impact Metrics (Evidence for Judges)

| Metric | Value | Evidence |
|--------|-------|----------|
| **Industry context (not our measurement)** | Gartner 2014: $5,600/min; EMA 2024: ~$14,056/min; identify phase 30+ min | README opening (sourced as industry context); video narration |
| **Measured improvement (the load-bearing claim)** | 30+ min identify by hand → the seconds shown on the live timer for detect-to-proposed-fix (reported separately from total time-to-resolution, which includes human deliberation) | Mission Control header timer; video timed beat |
| **Incident types handled** | 4 (payment-flag → toggle, latency → scale, plus two decoys: flag-already-off → rollback, OOM/memory-leak → rollback), each with a distinct correct remediation the agent reasons to from evidence | DEMO.md; eval harness (`tests/evals/`, scored 5/5) |
| **Uptime for demo** | 100% (mock mode) | `DYNATRACE_MCP_MODE=mock` is offline-deterministic |
| **Real-tenant validation** | Supports `remote`/`stdio` mode (production Dynatrace tenant); detection on live DQL | ARCHITECTURE.md; verified locally against the live tenant |
| **Framework-enforced safety** | ADK `require_confirmation=True` plus server-side action allow-lists | `autosre/agent/agent.py` (the three remediation tools are wrapped `FunctionTool(..., require_confirmation=True)`) and `autosre/agent/remediation.py` (allow-lists); tested in `test_remediation_gate.py` |
| **Deployment path** | Cloud Run (live), Vertex AI Agent Engine registerable | `deploy/deploy_cloud_run.sh` (Cloud Run); `deploy/agent_engine_deploy.py` (Agent Engine); live on project `autosre-470213` |

---

## Judging Alignment

**Technological Implementation (25%)**
- ✅ Gemini 3 reasoning via Vertex AI on the ADK (Agent Development Kit): the code-first surface of Google Cloud's Agent Platform. Self-hosted on Cloud Run, and registerable on Vertex AI Agent Engine via `deploy/agent_engine_deploy.py`.
- ✅ Dynatrace MCP is the only sensory system (detect + diagnose); load-bearing, not ornamental.
- ✅ ADK-native human-in-the-loop (`require_confirmation=True`): framework-enforced, stronger than prompt instruction, and backed by server-side action allow-lists that fail closed.
- ✅ Untrusted-telemetry guardrail in the agent instruction defends against indirect prompt injection through log and event text.
- ✅ Mode-agnostic guarantee: identical agent across mock/stdio/remote.

**Design (25%)**
- ✅ Mission Control UI: dark ops aesthetic, streaming timeline, hero approval card, recovery animation.
- ✅ Real-time SSE streaming makes autonomy visible (judges see the agent thinking live).
- ✅ Responsive design (1440/768/375).
- ✅ No AI-slop; intentional, specific design direction.

**Potential Impact (25%)**
- ✅ Measured on-screen: the live timer reports detect-to-proposed-fix latency in seconds (reported separately from total time-to-resolution). Industry context for the pain: $5,600/min (Gartner 2014) and ~$14,056/min (EMA 2024), framed as context rather than our measurement; identify phase 30+ min.
- ✅ Clear target users: on-call SREs, DevOps, retail/financial ops.
- ✅ Deployment path: Cloud Run today, with the same agent registerable on Vertex AI Agent Engine (no custom infrastructure).
- ✅ Generalizable loop: works for any incident type with appropriate observability + remediation tools.

**Quality of the Idea (25%)**
- ✅ The refusal is the differentiator. An autonomous SRE that reads Dynatrace and remediates is the track-default; an agent whose restraint is provable (it asks permission, obeys a no, and logs both outcomes on Dynatrace's timeline) is not.
- ✅ Reframes the question from "did it act fast" to "should it have acted, and who said so," which is the question an enterprise actually has to answer before trusting autonomy.
- ✅ Solves a real SRE problem: incident response at scale, with a compliance-grade record of every decision.
- ✅ Memorable one-liner: *"the on-call engineer that never touches prod without your approval, and writes down who said yes."*

---

## Final Notes

- **Judges will open the live URL and click it.** Ensure it works from incognito, cold load.
- **Judges will read the README.** Lead with the downtime-cost stat and architecture diagram.
- **Judges will watch the ~3-min video.** Make the approval moment the emotional peak.
- **Judges will open the code.** Ensure Dynatrace MCP usage is obvious; ensure `require_confirmation` gate is not removed.
- **Track selection matters.** We are racing other Dynatrace-track entries, not the entire field. A finished, polished, on-theme submission with genuine central MCP use and a differentiator the track-default builds lack (the audited refusal) is a realistic medal.
