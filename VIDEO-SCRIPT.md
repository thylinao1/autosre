# AutoSRE Demo Video Script (≤3 minutes)

**Criterion mapping:** Each beat is tagged with the judging criterion it scores (Tech / Design / Impact / Idea). All four must be visible on screen.

---

## Run-of-show (dry-run verified live, 2026-06-02)

Record on the hosted demo as-is (it runs the real Gemini agent). Viewport 1440 wide. Warm
it first with one throwaway loop so the model is hot, then start recording. Observed timings
on the warm model path:

| Beat | Click | Observed time | What to say while it happens |
|---|---|---|---|
| Trigger | `Run: Payment Errors` on `/demo` | gate appears in **8 to 16s** (plan ~12s) | "The agent queries Dynatrace, finds the 22% failure spike, reads the deploy, and pins the bad flag." The streaming timeline + the blast-radius problem card carry this beat. |
| **Deny first** | `Reject` | stands down in **~1.4s** | "First, watch what happens if I say no. The agent stands down. Nothing reaches production, and the refusal is written to the audit trail, right there on Dynatrace's timeline." |
| Approve | `Run Payment Errors Again` then `Approve` | gate ~8-16s again; `Approve` to green in **~3s** | "Now I approve it. The flag is disabled, the agent re-checks health, and the incident clears." |
| Timer read | (freezes on green) | **approve within 2-3s of the modal** for a tight number (~15-18s); the on-screen timer counts the whole run including your pause | "Detected, diagnosed, fixed, and verified in eighteen seconds, against thirty-plus minutes by hand." |
| Money shot | (hold on the resolved screen) | audit trail now shows **Approved and Rejected**, both `✓ Dynatrace` | "Two governed outcomes, both on the platform that detected the incident. That is the record a compliance team can audit." |

Reliability fallback only if Vertex flakes mid-take: re-add `AUTOSRE_DEMO_MODE=1` to the agent
(`gcloud run services update autosre --region us-central1 --update-env-vars AUTOSRE_DEMO_MODE=1`)
for an instant deterministic replay that still applies the real fix and still honors a reject;
remove it after (`--remove-env-vars AUTOSRE_DEMO_MODE`).

---

## [0:00-0:15] OPENING: The Real-World Pain (Impact + Idea)

**Visual:** Graphic overlay: "$5,600 per minute. That's the cost of IT downtime."

**Narration:**
"When production fails, every minute matters. Gartner's widely cited benchmark puts IT downtime at $5,600 a minute, and more recent estimates run higher still. Yet identifying the root cause typically takes 30+ minutes of manual detective work: opening dashboards, running queries, correlating events. By the time an on-call engineer narrows down the problem, you've already lost a lot of money.

This is AutoSRE, the autonomous on-call engineer that diagnoses production incidents from Dynatrace and fixes them. But it never touches production without your approval."

---

## [0:15-0:35] SETUP: The Service & The UI (Design + Tech)

**Visual:** Split screen:
- **Left:** Terminal showing `checkout-api` running, `GET /healthz` returns `ok`.
- **Right:** Open the Mission Control web UI in browser. Show the dark ops war-room aesthetic: problem card (empty state), phase timeline (DETECT→DIAGNOSE→ACT→VERIFY), DQL evidence panel empty, approval modal hidden.

**Narration:**
"Here's a checkout service in production. It's healthy. Our 'Mission Control' UI, built on Next.js and streamed over SSE, is ready to monitor an incident. Let's trigger one."

**Criterion note:** Design is visible: dark ops aesthetic, clean typography, three-panel layout, structured timeline. Tech is visible: "streamed over SSE," mentioning the real tech stack.

---

## [0:35-0:50] TRIGGER: Inject a Fault (Impact + Idea)

**Visual:** Terminal or UI demo-control button.

**Narration:**
"A bad deploy just went out. Payment processing is broken. Let's inject that fault."

**Action on screen:**
```bash
curl -X POST localhost:8081/_admin/inject \
     -H 'content-type: application/json' \
     -d '{"fault":"payment_errors"}'
```

Or click "Run Incident Sweep → payment_errors" in the UI.

**Narration:**
"In a real scenario, Dynatrace would detect this anomaly automatically. We're speeding up the detection for the demo."

---

## [0:50-1:20] DETECT & DIAGNOSE: The Agent's Thinking, on REAL Dynatrace (Tech + Idea)

**Visual:** Watch the Mission Control timeline light up in real time:

1. **DETECT phase**: The agent runs a live DQL query and the DQL evidence panel fills with the real series. The problem card resolves: "checkout-api failure rate at 22%, well above the 1% baseline."
2. **DIAGNOSE phase**: The agent reads the live service state (version 2.3.1, feature flag `new_payment_gateway` enabled) and states the root cause: the flag throws on AMEX cards.
3. **Agent reasoning** streams as short status lines.

**Credibility cut (this is the beat that proves it is real):** Cut to a terminal. AutoSRE is running in `DYNATRACE_MCP_MODE=stdio` against the actual Dynatrace tenant over the official `@dynatrace-oss/dynatrace-mcp-server`. On screen: the MCP server connects and authenticates to the tenant (`Successfully connected to the Dynatrace environment`), then the agent calls:
```
execute_dql(dqlStatement="timeseries avg(checkout.failure_rate), from:now()-30m")
```
and the result comes back with the real series, recent buckets reading `22, 22, 22`. No mock. This is the agent reading the real 22% incident from telemetry the checkout service streamed in as OpenTelemetry.

**Narration:**
"The agent goes to work. It queries our live Dynatrace tenant with DQL and sees the checkout failure rate sitting at twenty-two percent, far above the healthy baseline. Then it reads the deploy version and feature flags, and pins the cause: a payment-gateway flag from the latest deploy that breaks AMEX checkouts.

This part is not staged. The query you are watching runs against a real Dynatrace environment, over the official Dynatrace MCP server, reading telemetry our checkout service sent in as OpenTelemetry. The reasoning is Gemini 3 on Google Cloud's Agent Development Kit. The agent sees what actually happened, and it has not touched production yet."

**Criterion note:**
- **Tech:** real Dynatrace MCP server, real DQL, real OpenTelemetry ingest, Gemini 3 on ADK, SSE streaming, all named and shown live.
- **Idea:** autonomous detective work, with zero production changes so far.

---

## [1:20-1:50] PROPOSE & PAUSE: The Human-in-the-Loop Moment (Idea + Design)

**Visual:** The timeline reaches **ACT phase**. A large, glowing **APPROVE / REJECT card** slides in, blocking the rest of the screen.

Card shows:
```
ACTION PROPOSED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tool: toggle_feature_flag
Arguments:
  name: "new_payment_gateway"
  enabled: false

Hint: "Disable the offending feature flag on checkout-api."

[APPROVE]  [REJECT]
```

**Narration:**
"Here's the critical moment. The agent has diagnosed the problem and proposed a single, exact fix: disable the 'new_payment_gateway' feature flag. But it stops. Nothing has touched production yet.

This is the autonomy we built for. The agent does the 3am grunt work (the diagnosis, the reasoning), but the human decides. The approval gate is enforced in the code itself (ADK's `require_confirmation` function tool). The model cannot bypass it.

I approve it."

**Action on screen:** Operator clicks **APPROVE**.

**Criterion note:**
- **Idea:** This is the core differentiator. "Autonomous, but on your authority." Not a chatbot. Not a reckless auto-fix. The human is the decision-maker, and the system is built to enforce that.
- **Design:** The approval card is cinematic: big, clear, impossible to miss. The exact action and arguments are visible so the operator knows exactly what will happen.

---

## [1:50-2:20] ACT & VERIFY: Recovery (Tech + Impact)

**Visual:** After APPROVE is clicked:

1. The approval card slides away. The timeline continues: "Toggling feature flag…" tool call executes. Result: "Feature flag 'new_payment_gateway' disabled."
2. **VERIFY phase** begins. Tool call: `get_service_health`. Result: "Checkout-api is healthy. Failure rate: 0.4%. P99 latency: 210ms."
3. **Incident card flips green** with a subtle animation. Status changes to "RESOLVED."

**Narration:**
"The approved action executes and the flag is disabled. The agent re-checks the service's health via Dynatrace and the `/healthz` endpoint. Checkout-api is recovering. Failure rate is back to baseline. The incident is resolved.

From problem detection to root cause to fix approval to execution and verification, all in under a minute. What used to take 30+ minutes of manual work happens in real time, with the human in control the whole time."

**On-screen timer (now built into Mission Control, top-right of the header):** it starts the moment you click Run and freezes on the terminal outcome (for example "18.4s to resolution"). Read the number out loud ("detected, diagnosed, fixed, and verified in eighteen seconds, against thirty-plus minutes by hand"). One real timestamped number on the live artifact beats the borrowed Gartner math, and it is the Impact evidence. Approve promptly so the frozen number stays tight.

**Criterion note:**
- **Tech:** "Dynatrace," "flag toggle," "health verification," SSE streaming, all real and visible.
- **Impact:** The speed (a real on-screen timer, seconds vs. 30+ minutes) and the outcome (incident resolved, service healthy) are both visible, measured.

---

## [LEAD WITH THIS: the deny run] Prove the gate is real, not theater (Idea)

> Council guidance: this is the single most ownable beat in the whole video, because it is the one thing the track-default builds will not show. Strongly consider opening on it (reject first, then run again and approve), so the refusal is the first thing a judge sees, not a footnote. The path is now hardened end to end: the reject reaches a clean "Declined" card in about a second, production is untouched, and the Audit trail logs the refusal as `rejected / declined` right next to a prior approval. In DEMO_MODE the stand-down is instant.

Everyone in this track will demo *approve*. Almost no one demos *reject*. Spend ~12 seconds proving the gate actually holds:

**Visual:** Run the incident. When the approval card appears, click **REJECT**. The agent stands down: the timeline shows it acknowledging the rejection, the incident card stays red, and `get_service_health` confirms the flag is still enabled and **nothing reached production**. Then run it again and **APPROVE** to resolve.

**Narration:**
"First, watch what happens if I say no. I reject the fix. The agent stands down. It does not retry, it does not work around me, and production is untouched. The gate is enforced in the code, so the model cannot route around a human. Now I will approve it, and it recovers."

**Criterion note — Idea + Tech:** the reject path is the proof that "autonomous, but accountable" is a real guarantee and not a slogan. It is the single most convincing demonstration that the human authority is genuine, and it is the beat the other entries will not have.

---

## [2:20-2:50] CLOSE & VISION (Idea + Impact)

**Visual:** Show the complete, resolved incident card. Summary panel shows a brief narrative of what happened.

**Narration:**
"AutoSRE is built on Gemini 3 via Google Cloud's Agent Platform, deployed to Vertex AI Agent Engine, and powered entirely by Dynatrace MCP for observability. It's the on-call engineer that never sleeps, never guesses, and never acts without your say-so.

For SREs and DevOps teams in high-cost industries (retail, finance, e-commerce), this is incident response at scale. Detect anomalies in seconds. Diagnose with live telemetry. Propose the fix. Approve it. Execute it. Verify recovery. All with you in the loop.

This is the future of production incident management: *autonomous, but accountable.*"

**Criterion note:**
- **Idea:** The vision line ("autonomous, but accountable") is the one-liner. Sharp, memorable, different from both chatbots and reckless automation.
- **Impact:** Positioning for real users (SREs, DevOps, high-cost industries) and the real benefit (incident MTTR collapse, human oversight).

---

## [2:50-3:00] CALL TO ACTION

**Visual:** Show the GitHub repo URL and the live hosted Mission Control URL on screen:
- Live demo: `autosre-ui-vrf7h4n4ra-uc.a.run.app/demo`
- Code: `github.com/thylinao1/autosre`

**Narration:**
"AutoSRE is open source, deployed live on Google Cloud, and ready to be your on-call engineer. Try it yourself."

---

## Recording Notes

1. **Two layers, recorded separately, cut together:**
   - **The polished UI loop** is recorded on the hosted Mission Control URL running the **real Gemini agent live** (this is the primary path, verified: model-generated DQL that varies run to run, real ADK confirmation ids). `AUTOSRE_DEMO_MODE=1` is the deterministic model-free **fallback** only, to be used if Vertex flakes mid-take; the approved remediation still runs for real in that mode too. Record live; keep the fallback in your back pocket.
   - **The real-Dynatrace credibility cut** (the 0:50-1:20 terminal beat) is recorded locally with `DYNATRACE_MCP_MODE=stdio` against the live tenant. This is the proof that the integration is real, not a mock. Exact reproduce steps are in the appendix below; it is verified working end to end (real DQL returns 22, the agent diagnoses the flag, the approval gate fires, recovery confirms).
2. **Pacing:** Aim for roughly 3:00. Every beat must be visible and named (judges should hear "Gemini 3," "Agent Builder / ADK," "Dynatrace MCP," "Vertex AI Agent Engine" at least once each).
3. **Audio:** Clean, clear narration. Emphasize the **one-tap approval moment** as the emotional peak.
4. **Visual hierarchy:** The Mission Control UI should be the largest, most-visible element for most of the video. The operator's decision (APPROVE button) should be the hero moment. The terminal credibility cut is a short, deliberate "and this is real" interlude.
5. **Live URLs:** Hosted demo `https://autosre-ui-vrf7h4n4ra-uc.a.run.app/demo` (landing at `/`). Code `https://github.com/thylinao1/autosre`. Both work from incognito.
6. **Fallback:** If the live tenant is unreachable while recording the credibility cut, the hosted DEMO_MODE loop alone still carries the full narrative; just trim the terminal interlude. Reliability of the main story never depends on the network.

---

## Criterion Checklist

- [ ] **Tech (25%):** Gemini 3, Agent Platform / ADK, Vertex AI Agent Engine, Dynatrace MCP, SSE streaming, Cloud Run deployment all mentioned/shown.
- [ ] **Design (25%):** Mission Control UI aesthetic, dark ops war-room, timeline, approval card, recovery animation all visible.
- [ ] **Impact (25%):** $5,600/minute downtime cost stat, 30+ min → ~1 min diagnosis time, real user personas (SREs, DevOps).
- [ ] **Idea (25%):** "Autonomous, but on your authority" framing, human-in-the-loop as differentiator, sharp one-liner closing.

---

## Approval Decision Timeline

**If recording live:**
- Let the approve/reject moment real-time pause to feel natural (2-3 seconds of silent UI waiting). This shows that the system is truly paused and waiting for human input.
- Do NOT make this instant or cut it out. The pause IS the product.

**Background music (optional):**
- Minimal, instrumental, tech-forward (lo-fi synthwave or similar). Keep narration center.
- Fade out during the approve/reject moment so the silence (and the decision) stands out.

---

## Appendix: Reproduce the real-Dynatrace credibility cut (verified working)

This is the terminal beat for 0:50-1:20. It runs the agent against the live Dynatrace
tenant over the official MCP server, with no mock. Verified end to end this session.

**Prerequisites (one gotcha that matters):**
- **Node 22+ is required.** The official `@dynatrace-oss/dynatrace-mcp-server` (v1.8.6)
  crashes on Node 20 (`webidl.util.markAsUncloneable is not a function`). Run `nvm use 22`
  first. Confirm with `node --version`.
- `.env` already holds `DT_ENVIRONMENT`, the Platform token (`DT_PLATFORM_TOKEN`), the Gemini
  key, and the OTLP ingest vars. The agent uses `DYNATRACE_MCP_MODE=stdio` against this tenant.
- The real server is DQL-first: the trial tenant has no Davis problem, so the agent detects
  on `timeseries avg(checkout.failure_rate)`, not on a precomputed problem. The latency
  scenario queries `checkout.cpu_utilization` (a real OTel custom metric the service exports),
  never a `builtin:kubernetes.*` metric — this tenant has no OneAgent, so builtins return
  nothing. The instruction pins the real metric keys so the agent cannot invent one.

**Steps:**

```bash
nvm use 22                       # required; the real MCP server needs Node 22+

# 1. Run a local checkout-api that streams real OpenTelemetry to the tenant.
#    (`python -m autosre.target_service.main` does NOT load .env, so OTLP would be off.
#     This one-liner loads .env first, then imports the app so otel.setup() sees the OTLP vars.)
PYTHONUNBUFFERED=1 .venv/bin/python -c \
  "from dotenv import load_dotenv; load_dotenv(); import uvicorn; \
   from autosre.target_service.main import app; uvicorn.run(app, host='127.0.0.1', port=8081)" &

# 2. Inject the incident so 22% starts flowing into Grail.
curl -s -X POST http://127.0.0.1:8081/_admin/inject \
     -H 'content-type: application/json' -d '{"fault":"payment_errors"}'

# 3. Wait ~90s for ingest. (Optional clean-number tip below.)

# 4. Run the agent against the live tenant. Omit --auto-approve so YOU approve on camera.
DYNATRACE_MCP_MODE=stdio .venv/bin/python -m autosre.run_agent
```

**Clean-number tip (so the on-camera reading is a crisp 22, matching the narration):**
the unfiltered `avg(checkout.failure_rate)` blends every instance reporting as `checkout-api`.
If the deployed Cloud Run checkout-api is also warm and healthy (~0.3%), it dilutes the average
to ~11%. Two easy fixes: either leave the deployed service untouched so it goes cold (it stops
exporting when idle), or inject the same fault on it too so every reporter agrees on 22:
`curl -s -X POST https://checkout-api-vrf7h4n4ra-uc.a.run.app/_admin/inject -H 'content-type: application/json' -d '{"fault":"payment_errors"}'`.
The agent declares an incident at 5% or higher either way; this is only about the on-screen number.

**Cleanup after recording** (so the live demo's checkout-api stays pristine):
```bash
curl -s -X POST https://checkout-api-vrf7h4n4ra-uc.a.run.app/_admin/inject -H 'content-type: application/json' -d '{"fault":"clear"}'
# stop the local checkout-api (the backgrounded process from step 1)
```

**Expected output (the beat to capture), trimmed from a verified run:**
```
✅ Successfully connected to the Dynatrace environment at https://dkr99558.apps.dynatrace.com.
Dynatrace MCP Server v1.8.6 running on stdio
   → tool: execute_dql({'dqlStatement': 'timeseries avg(checkout.failure_rate), from:now()-30m'})
   ← result: ... 'avg(checkout.failure_rate)': [..., 19.31, 22, 22]   # real series, recent buckets ~22
   → tool: get_service_health({})                                    # v2.3.1, new_payment_gateway: True
   → tool: toggle_feature_flag({'name': 'new_payment_gateway', 'enabled': False})
   ← result: {'error': 'This tool call requires confirmation, please approve or reject.'}   # HITL gate
!!! HUMAN APPROVAL REQUIRED !!!  -> approve on camera
   ← result: {'resolved_incident': True, 'service_healthy': True, 'failure_rate': 0.24}
AutoSRE: DETECT: failure rate observed at 22% ... ACT: disabled 'new_payment_gateway' ... VERIFY: healthy.
Done.
```
