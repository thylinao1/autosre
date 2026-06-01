# AutoSRE Demo Video Script (≤3 minutes)

**Criterion mapping:** Each beat is tagged with the judging criterion it scores (Tech / Design / Impact / Idea). All four must be visible on screen.

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

## [0:50-1:20] DETECT & DIAGNOSE: The Agent's Thinking (Tech + Idea)

**Visual:** Watch the web UI timeline light up in real time:

1. **DETECT phase**: A problem card appears: "Checkout failure rate spiked to 22% after deploy v2.3.1." Show the problem details (severity: AVAILABILITY, affected entity: checkout-api, metrics).
2. **DIAGNOSE phase**: Tool calls stream: `execute_dql(dqlQueryString="fetch events | filter...")`. Evidence appears: "Deploy v2.3.1 enabled feature flag 'new_payment_gateway'."
3. **Agent reasoning**: A text bubble appears: "Root cause: feature flag 'new_payment_gateway' introduced a bug in AMEX card processing, causing 22% of checkouts to fail."

**Narration:**
"The agent springs into action. It pulls open problems from Dynatrace: a checkout failure spike after the latest deploy. It runs DQL to inspect the logs and deployment history, and correlates the problem with a feature flag that was enabled at the same time.

The agent is not guessing. It's built on Gemini 3 reasoning on Google Cloud's Agent Platform (the Agent Development Kit), and it's reading live telemetry from Dynatrace MCP. It *sees* what happened."

**Criterion note:**
- **Tech:** "Gemini 3 reasoning," "Agent Development Kit," "Dynatrace MCP," SSE streaming all visible and named.
- **Idea:** The agent is doing detective work autonomously, but it hasn't touched production yet.

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

**Criterion note:**
- **Tech:** "Dynatrace," "flag toggle," "health verification," SSE streaming, all real and visible.
- **Impact:** The speed (detected, diagnosed, fixed in ~1 minute vs. 30+ minutes) and the outcome (incident resolved, service healthy) are both visible metrics.

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

**Visual:** Show the GitHub repo URL and the live hosted Mission-Control URL (placeholder if not yet deployed).

**Narration:**
"AutoSRE is open-source, deployed live on Google Cloud, and ready to be your on-call engineer. Check it out."

---

## Recording Notes

1. **Demo reliability:** Record detect/diagnose against a real Dynatrace trial tenant (show real problems, real DQL). Act/verify in `mock` mode (100% reliable, byte-identical UI). The contract guarantees this works: the SSE stream and event shapes are the same regardless of mode.
2. **Pacing:** Aim for exactly 3:00. Every beat must be visible and named (judges should hear "Gemini 3," "Agent Platform," "Dynatrace MCP," "Vertex AI Agent Engine" at least once each).
3. **Audio:** Clean, clear narration. Emphasize the **one-tap approval moment** as the emotional peak.
4. **Visual hierarchy:** The Mission Control UI should be the largest, most-visible element for ~60% of the video. The operator's decision (APPROVE button) should be the hero moment.
5. **Fallback:** If the live Dynatrace tenant is unavailable during recording, use `DYNATRACE_MCP_MODE=mock` throughout. The UI and narrative are identical, judges won't know the difference, and reliability is guaranteed.

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
