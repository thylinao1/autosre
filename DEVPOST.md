# AutoSRE Devpost Submission (Draft)

## Project Name
**AutoSRE: The Autonomous On-Call Engineer**

---

## Elevator Pitch (under 200 characters)

AutoSRE is an autonomous on-call agent that diagnoses Dynatrace incidents in seconds and queues up the fix, but cannot touch production without your one-tap approval.

---

## What It Does

AutoSRE **detects** a production incident from Dynatrace, **diagnoses** the root cause from live telemetry with Gemini 3, **proposes exactly one fix**, and **stops** until a human approves it.

Built on the **Agent Development Kit (ADK)**, the code-first surface of **Google Cloud's Agent Platform**, reasoning on **Gemini 3 via Vertex AI**, deployed on **Cloud Run**, with the **Dynatrace MCP** as its only observability source.

The agent runs a **6-step loop** (demonstrable entirely locally via a bundled deterministic mock, or live against a real Dynatrace tenant):

1. **DETECT**: pull open problems from Dynatrace.
2. **DIAGNOSE**: run DQL queries to correlate the problem with recent changes.
3. **PROPOSE**: name exactly one remediation (disable flag, rollback, scale).
4. **PAUSE**: block until a human approves (ADK-native `require_confirmation=True`, not a prompt).
5. **ACT**: execute the approved remediation.
6. **VERIFY**: re-check service health and confirm recovery.

**The value:** triage that takes an on-call engineer **30+ minutes** by hand happens in the **seconds** shown on the demo's live timer, with a human still owning every change that reaches production.

**The web UI:** a dark "Mission Control" dashboard **streams the loop live** over SSE. The operator taps **APPROVE** and watches the incident card flip green on verified recovery.

**Key differentiators:**
- **The refusal is the product.** Remediation tools are wrapped in ADK `require_confirmation=True`: the model **cannot touch production** without a human decision, and a rejection stands the agent down with nothing changed.
- **Both outcomes are audited on Dynatrace's own timeline.** An append-only ledger records who decided, what, and the outcome, then **writes it back to the tenant**: `approved / resolved` or `rejected / declined`.
- **Dynatrace MCP is load-bearing.** It is the agent's only sensory system; detection runs on a **live DQL query** against real OpenTelemetry, not a canned reply.
- **Mode-agnostic guarantee.** Identical agent code across `DYNATRACE_MCP_MODE=mock | stdio | remote`; only env vars change.
- **Graded, not vibes.** A 25-run eval grades the live agent against an **answer key it has no tool to reach**: 25/25 correct, 0/25 false actions (0%), 5/5 no-action traps refused, median 13.3s detect-to-proposal. Results export to the **same Dynatrace tenant the agent monitors** (queryable in Grail) and render live at `/reliability`.

> **Why the audit trail uses the Log Monitoring API:** our tenant is OpenTelemetry-only, so we built the write-back on the one ingest API every Dynatrace tenant has. That is a deliberate choice: it proves the governance model works **independently of premium APIs** (Davis problems, Smartscape). The ledger still distinguishes **sent** (the tenant acknowledged the write) from **verified** (a read-back DQL confirmed it is queryable). Detection, by contrast, is full live DQL against real telemetry.

---

## How We Built It

### Tech Stack & Architecture

- **Reasoning engine:** **Gemini 3** via **Vertex AI** (`gemini-3-flash-preview` by default; `gemini-3-pro-preview` opt-in).
- **Agent framework:** **Google Cloud's ADK** (code-first Agent Platform). Self-hosted on **Cloud Run**; also deployable to **Vertex AI Agent Engine** via `deploy/agent_engine_deploy.py`.
- **Observability partner:** **Dynatrace MCP server** (official `@dynatrace-oss/dynatrace-mcp-server` or hosted gateway). Read-only tools (`query_problems`, `execute_dql`, `get_events_for_kubernetes_cluster`) drive detect, diagnose, and recovery confirmation.
- **Remediation tools:** Python `FunctionTool` with `require_confirmation=True`, each **machine-bounded by server-side allow-lists** (replica band, known-good versions, managed flags) so out-of-bounds actions fail closed even when approved.
- **Web UI:** Next.js 16, Tailwind CSS v4, TypeScript. Streams SSE; renders the live timeline and approval modal.
- **Backend:** FastAPI HTTP + SSE. Per-run sessions and the pause/resume bridge for the approval round-trip.
- **Target service:** FastAPI `checkout-api` with injectable faults and state introspection.
- **Deployment:** Docker on **Cloud Run** (agent, checkout-api, web UI); the agent is pinned single-instance so run state and ledger stay coherent.

### Key Design Decisions

1. **ADK-native HITL over prompt instruction:** the gate is `FunctionTool(require_confirmation=True)`, **enforced by the framework**, not a system-prompt hack the model could talk itself out of.

2. **Streaming events contract:** agent and UI speak **typed JSON SSE frames** (8 event types), so the UI renders the agent's reasoning in real time.

3. **Mode-agnostic guarantee:** the Dynatrace toolset sits behind one factory (`build_dynatrace_toolset`). `mock`, `stdio`, and `remote` swap with env vars; the **agent code never changes**.

4. **One model, by design:** the only LLM is **Gemini 3 on Vertex AI**. The observability intelligence comes from Dynatrace through the MCP; detection is live DQL.

5. **Defense in depth around the gate:** server-side **allow-lists fail closed** even on an approved-but-poisoned action; an **untrusted-telemetry guardrail** treats all Dynatrace data as evidence, never instructions; and the demo target **never leaks the answer key**, so the diagnosis is genuine reasoning, not a lookup.

6. **The agent's own failures fail safe.** Gemini rate limits and transient errors (429, 503) trigger a bounded backoff-and-resume in the shared loop (`autosre/server/loop.py`: up to 10 retries, honoring the API's suggested retry delay, surfaced in the UI as a live "retrying" note), and exhausted retries end the run as a typed `error` frame instead of a hang. Bad tool traffic cannot crash the loop either: an off-target DQL query or an unreachable backend comes back as an error or empty-result payload the model reads as evidence and adjusts to, and an out-of-bounds remediation returns a structured `blocked` result from the allow-list, so every failure lands in the model's context or the audit trail, never in an unhandled exception.

---

## Challenges

1. **Dynatrace MCP availability:** the official server was not available early, so we built a **deterministic mock MCP server** with the same protocol. It became a feature: `mock` mode is now the reliable offline demo path.

2. **SSE streaming + approval pause:** holding a stream open while blocking on a human required a **per-run state machine** (`autosre/server/runs.py`) that parks the loop on a future and resumes it on the decision POST.

3. **Gemini rate limiting:** the free tier allows ~5 req/min and a full loop makes 4 to 5 model calls. The shared loop (`autosre/server/loop.py`) **backs off and resumes** on 429/503 (up to 10 retries, honoring the API's suggested retry delay) and surfaces the wait in the UI, so a rate-limited run completes instead of dying. For judging, use an **API key with real quota** (billing enabled) so a test run never waits on a 429.

4. **Mode-agnostic testing:** tool names and response shapes are **tested against the contract** so `mock`, `stdio`, and `remote` stay byte-identical to the UI.

5. **CORS between Cloud Run instances:** the UI and agent live on different domains; an explicit `ALLOWED_ORIGIN` env var scopes CORS on the SSE and POST endpoints.

6. **Auditing the refusal correctly:** ADK emits a confirmation stub for the gated tool **before** the human decides, which a naive classifier miscounts as "acted". We derive the decision from the operator's actual choice and pinned it with **deny-path regression tests** so the marquee refusal beat cannot silently re-break.

---

## What's Next

- **Multi-incident concurrency:** extend the one-run-per-session model to parallel incident tracking.
- **Deeper Dynatrace integration:** Davis AI problem context, change events, SLO violations, custom metrics.
- **More remediation types:** config changes, canary rollbacks, circuit-breaker trips.
- **Slack / PagerDuty integration:** escalation and approval in the tools on-call teams already live in.
- **Real Kubernetes cluster:** demo against live k8s instead of the mock checkout-api.
- **Second-opinion verifier (shipped, opt-in):** an independent Gemini pass critiques the fix before the human sees it (`AUTOSRE_SECOND_OPINION=1`). Next: default-on with a confidence score.
- **Graduated-autonomy risk tiers (shipped):** every action carries a risk tier (`autosre/server/policy.py`); an operator can pre-authorize a tier so low-risk actions auto-apply, audited. Next: richer per-action policy.
- **Ledger-as-memory (shipped):** the agent cites past decisions via `get_recent_decisions`. Next: semantic similarity over past incidents instead of recency.
- **Diagnosis eval harness (shipped, multi-trial):** `tests/evals/` grades the live agent against a test-only answer key under a pre-registered pass criterion. Latest committed run: **25/25 correct, 0/25 false actions, 5/5 trap refusals, median 13.3s**, exported to the Dynatrace tenant. Next: broaden the scenario pool and gate CI on it.

---

## Selected Track

**Dynatrace.** The agent's only observability source is the Dynatrace MCP server, and it is load-bearing: detection and diagnosis run on live DQL against real OpenTelemetry, and every approval is written back to the tenant. (Davis is Dynatrace's built-in problem engine; our trial tenant is OpenTelemetry-only, so we detect via DQL rather than Davis problems.)

---

## Devpost Form Fields (Summary)

| Field | Content |
|-------|---------|
| **Project Name** | AutoSRE: The Autonomous On-Call Engineer |
| **Tagline** | AutoSRE is an autonomous on-call agent that diagnoses Dynatrace incidents in seconds and queues up the fix, but cannot touch production without your one-tap approval. |
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
- [ ] **Reproducibility:** Judges can clone the repo, set `GOOGLE_API_KEY=...` (from Google AI Studio; a billed key avoids free-tier 429 waits) and `DYNATRACE_MCP_MODE=mock`, and run the full demo offline in <5 minutes.
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
