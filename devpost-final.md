# Devpost Submission - Final Copy (paste-ready)

Every field below is ready to paste into the Devpost form as-is. Written in
first person singular throughout. The one thing to add by hand is the YouTube
link where marked.

---

## Project name (max 60 characters)

```
AutoSRE: The Autonomous On-Call Engineer
```

(41 characters)

---

## Elevator pitch (max 200 characters)

```
AutoSRE is an autonomous on-call agent that diagnoses Dynatrace incidents in seconds and queues up the fix, but cannot touch production without your one-tap approval.
```

(166 characters)

---

## About the project (Markdown)

```markdown
## Inspiration

Production incidents are expensive and miserable in a very specific way: the
fix usually takes a minute, but **finding** it takes the 3am engineer 30+
minutes of dashboards, queries, and correlation. Industry context for the
stakes, not my measurement: Gartner's widely cited 2014 figure puts IT downtime
at **$5,600 per minute**, and EMA Research's 2024 analysis at roughly
**$14,056 per minute**. What I measure on screen is the part AutoSRE actually
changes: the investigation.

The other inspiration was distrust. The Dynatrace track is full of agents that
read telemetry and remediate. Almost nobody builds the moment the agent is told
**no**, obeys, and leaves a record of it. I wanted that refusal to be the
product.

## What it does

AutoSRE **detects** a production incident from Dynatrace, **diagnoses** the
root cause from live telemetry with Gemini 3, **proposes exactly one fix**, and
**stops** until a human approves it.

The agent runs a **6-step loop** (demonstrable entirely locally via a bundled
deterministic mock, or live against a real Dynatrace tenant):

1. **DETECT**: pull open problems from Dynatrace.
2. **DIAGNOSE**: run DQL queries to correlate the problem with recent changes.
3. **PROPOSE**: name exactly one remediation (disable flag, rollback, scale).
4. **PAUSE**: block until a human approves (ADK-native `require_confirmation=True`, not a prompt).
5. **ACT**: execute the approved remediation.
6. **VERIFY**: re-check service health and confirm recovery.

**The value:** triage that takes an on-call engineer **30+ minutes** by hand
happens in the **seconds** shown on the demo's live timer, with a human still
owning every change that reaches production.

What makes it different:

- **The refusal is the product.** Remediation tools are wrapped in ADK
  `require_confirmation=True`: the model **cannot touch production** without a
  human decision, and a rejection stands the agent down with nothing changed.
- **Both outcomes are audited on Dynatrace's own timeline.** An append-only
  ledger records who decided, what, and the outcome, then **writes it back to
  the tenant**: `approved / resolved` or `rejected / declined`.
- **Dynatrace MCP is load-bearing.** It is the agent's only sensory system;
  detection runs on a **live DQL query** against real OpenTelemetry.
- **Graded, not vibes.** A 25-run eval grades the live agent against an
  **answer key it has no tool to reach**: 25/25 correct, 0/25 false actions
  (0%), 5/5 no-action traps refused, median 13.3s detect-to-proposal. Results
  export to the **same Dynatrace tenant the agent monitors** and render live at
  `/reliability`.

## How I built it

- **Reasoning engine:** **Gemini 3** via **Vertex AI** (`gemini-3-flash-preview`).
- **Agent framework:** **Google Cloud's Agent Development Kit (ADK)**, the
  code-first surface of the Agent Platform. Self-hosted on **Cloud Run**; the
  same agent is deployable to **Vertex AI Agent Engine**.
- **Observability partner:** the **Dynatrace MCP server**. Read-only tools
  (`query_problems`, `execute_dql`, `get_kubernetes_events`) drive detect,
  diagnose, and recovery confirmation.
- **Remediation tools:** Python `FunctionTool` with `require_confirmation=True`,
  each **machine-bounded by server-side allow-lists** (replica band, known-good
  versions, managed flags) so out-of-bounds actions fail closed even when
  approved.
- **Web UI:** Next.js 16 + Tailwind v4 "Mission Control" that streams the loop
  live over **typed SSE frames** and renders the approval gate as a blocking
  modal.
- **Backend:** FastAPI with per-run sessions and a pause/resume bridge: the
  loop parks on a future until the approval POST resolves it.
- **Defense in depth:** an **untrusted-telemetry guardrail** (all Dynatrace
  data is evidence, never instructions), per-IP rate limits, a single-active-run
  guard, and a demo target that **never leaks the answer key**, so the diagnosis
  is genuine reasoning rather than a lookup.

## Challenges I ran into

1. **Holding an SSE stream open across a human pause.** I built a per-run state
   machine that parks the agent loop on a future and resumes the same ADK
   session when the decision arrives.
2. **Auditing the refusal correctly.** ADK emits a confirmation stub for the
   gated tool **before** the human decides, which a naive classifier miscounts
   as "acted". I derive the decision from the operator's actual choice and
   pinned it with deny-path regression tests.
3. **Gemini rate limits.** The free tier allows ~5 requests/minute and a full
   loop makes 4 to 5 model calls. The shared loop backs off and resumes on
   429/503, honoring the API's suggested retry delay, and surfaces the wait in
   the UI instead of hanging.
4. **Grading a nondeterministic agent honestly.** I built an eval harness with
   a pre-registered pass criterion, decoy incidents where the reflex fix is
   wrong, and a no-action trap, scored against an answer key the agent has no
   tool to reach.

## Accomplishments that I'm proud of

- The full 6-step loop **deployed and verified live**: detect, diagnose,
  propose, pause, act, verify, with the approval gate enforced by the framework.
- **25/25 graded runs correct, 0/25 false actions, 5/5 no-action traps
  refused**, median 13.3s detect-to-proposal, with timestamped transcripts
  committed and the results queryable in the Dynatrace tenant via DQL.
- Both the approval **and the refusal** land in an append-only audit trail and
  write back to Dynatrace, with an honest `sent` vs `verified` badge.
- A 71-test suite (70 deterministic offline, 1 live-gated) pinning the deny
  path, the allow-list bounds, rate limiting, and the eval aggregation.
- A 50-check security audit with the scorecard published in `SECURITY.md`.

## What I learned

The approval pause is the product, not a bug. A framework-enforced gate is
stronger than any prompt instruction, and stronger still when backed by
machine bounds that fail closed. I also learned to treat telemetry as
attacker-influenceable input: the agent reads it as evidence to summarize,
never as instructions to follow. And I learned that grading an agent against
an answer key it cannot see changes how you build everything upstream of it.

## What's next for AutoSRE

- **Multi-incident concurrency** beyond the one-run-per-session model.
- **Deeper Dynatrace integration**: Davis AI problem context, change events,
  SLO violations.
- **Slack / PagerDuty approvals** in the tools on-call teams already live in.
- **Default-on second-opinion verifier**: an independent Gemini pass that
  critiques the fix before the human sees it (shipped today as opt-in).
- **Richer graduated autonomy**: risk tiers are shipped; per-action policy
  configuration is next.
- **CI as a regression gate** on the eval harness, with a broader scenario pool.
```

---

## Built with (languages, frameworks, platforms, cloud services, APIs)

```
python, typescript, gemini, google-cloud, vertex-ai, agent-development-kit,
cloud-run, secret-manager, dynatrace, mcp, fastapi, next.js, react, tailwindcss,
server-sent-events, opentelemetry, docker, pytest, playwright
```

---

## "Try it out" links

```
https://autosre-ui-vrf7h4n4ra-uc.a.run.app/demo
https://github.com/thylinao1/autosre
```

---

## Open source repository URL

```
https://github.com/thylinao1/autosre
```

MIT license, auto-detected by GitHub and visible in the About box.

---

## Hosted project URL (for judging)

```
https://autosre-ui-vrf7h4n4ra-uc.a.run.app/demo
```

Works from an incognito window. The landing page is at the root URL and the
graded eval scorecard is at `/reliability`.

---

## Demo video

```
<<PASTE YOUTUBE LINK HERE>>
```

(3:36, shows the deny run, the real-tenant DQL detection, approve to resolved,
and the graded scorecard queried from Grail.)

---

## Google Cloud products used

```
Vertex AI (Gemini 3, gemini-3-flash-preview), Agent Development Kit (ADK),
Cloud Run, Cloud Build, Secret Manager, Artifact Registry / Container Registry,
Cloud Logging. Vertex AI Agent Engine (deploy script included; managed-runtime
constraint documented honestly in the README).
```

---

## All other tools and products used

```
Dynatrace (MCP server, DQL / Grail, Log Monitoring API v2, OpenTelemetry
ingest, Notebooks), FastAPI, Next.js 16, React 19, Tailwind CSS v4, TypeScript,
Python 3.13, httpx, Pydantic, sse-starlette, OpenTelemetry SDK, Docker, pytest,
Playwright, npm
```

---

## Image gallery (3:2, all produced and committed in `submission/gallery/`)

Upload in this order. Every file is exactly 3:2 and under 1 MB (Devpost limit
is 5 MB).

| # | File | Subject | How it was produced |
|---|------|---------|---------------------|
| 1 | `brand-02-hero.png` | Cover: logo lockup + tagline + stack line | Rendered from `submission/brand.html`, screenshot at 1200x800 |
| 2 | `gallery-03-approval-gate.png` | Mission Control mid-incident, paused at the approval gate (risk badge, proposed args, Reject/Approve) | Live capture of the deployed demo during a real Gemini run, 1800x1200 |
| 3 | `gallery-05-declined.png` | The deny path: rejected, agent stood down, refusal audited | Live capture after clicking Reject on a real run |
| 4 | `gallery-04-resolved.png` | The resolved green board: incident cleared, approval audited, timer frozen | Live capture after clicking Approve on a real run |
| 5 | `gallery-06-reliability-scorecard.png` | The /reliability scorecard: 25 graded runs, 0 false actions, per-scenario table | Live capture of the deployed /reliability page |
| 6 | `gallery-07-dynatrace-notebook.png` | Dynatrace notebook proof: runs 25 / falseActions 0 / correct 25 | Authentic notebook frame extracted from the demo video, set in a brand card (`submission/notebook-card.html`) |
| 7 | `security-card.png` | Security posture card: 50-check scorecard + six layered defenses | Rendered from `submission/security-card.html`, screenshot at 1800x1200 |
| 8 | `gallery-08-devices.png` | Laptop + phone mockup of Mission Control (accessibility/responsiveness) | Composed from live captures in `submission/devices-card.html` |
| 9 | `gallery-01-landing-hero.png` | Landing hero with eval stats and the agent execution flow | Live capture of the deployed landing page |

Spares if a slot opens up: `gallery-02-demo-idle.png` (standby board),
`brand-01-logo.png` / `brand-03-gradient.png` / `brand-04-grid.png` (brand
renders).

---

## Track selection

```
Dynatrace
```

---

## Final checklist before clicking Submit

- [ ] Paste the YouTube link into the video field (the one manual step left).
- [ ] Upload the 9 gallery images in the order above.
- [ ] Confirm the live demo opens from an incognito window.
- [ ] Track: Dynatrace.
