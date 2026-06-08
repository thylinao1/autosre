# Devpost Submission Checklist — AutoSRE (Dynatrace track)

## Required deliverables
- [x] **Hosted project URL** — **https://autosre-ui-vrf7h4n4ra-uc.a.run.app** — live
      Mission-Control web UI on Cloud Run; streams the full incident loop and the operator
      approval gate. Agent (Gemini 3 via Vertex AI) + checkout-api also on Cloud Run.
      Verified end-to-end from incognito: both APPROVE (detect → diagnose → approve →
      resolved/green) and REJECT (agent stands down, production untouched, audited as declined).
- [x] **Public open-source repo** — **https://github.com/thylinao1/autosre** (public).
- [x] **OSS license detectable in About** — `LICENSE` (MIT) at repo root; GitHub's
      license endpoint detects it as MIT, so the About sidebar shows "MIT".
- [ ] **~3 minute demo video** — follow [VIDEO-SCRIPT.md](VIDEO-SCRIPT.md) (criterion-tagged beats). _(record + link)_
- [x] **Track selected** — **Dynatrace**.
- [ ] **Devpost form** completed — draft fields in [DEVPOST.md](DEVPOST.md). _(submit)_

## How we satisfy each judging requirement
- **Beyond chat / uses tools** → agent calls Dynatrace MCP tools (detect/diagnose) and
  remediation tools that change real service state (toggle flag, scale, rollback).
  Code: `autosre/agent/agent.py`, `autosre/agent/dynatrace.py`, `autosre/agent/remediation.py`.
- **Multi-step mission with planning** → 6-step loop (DETECT→DIAGNOSE→PROPOSE→PAUSE→ACT→VERIFY)
  in system prompt. Model chooses DQL strategy and diagnoses root cause.
- **Human in control** → ADK-native `FunctionTool(require_confirmation=True)` on remediation
  tools; Python-enforced approval gate that blocks tool execution.
  Tested in `tests/test_remediation_gate.py`.
- **Meaningful MCP partner integration** → Dynatrace MCP is the **only** sensory system.
  Detection + diagnosis run on the Dynatrace MCP read tools: `execute_dql` (the live path
  detects on a real `timeseries avg(checkout.failure_rate)` query against the tenant),
  `list_problems`/`query_problems`, and `get_kubernetes_events`. Tool names are snake_case
  (valid Gemini function-call identifiers) and verified against `@dynatrace-oss/dynatrace-mcp-server` v1.8.6.
  Toolset built in `autosre/agent/dynatrace.py`; mode-agnostic (mock/stdio/remote).
- **Gemini 3 + Google Cloud Agent Builder** → ADK `LlmAgent` on **Gemini 3**
  (`gemini-3-flash-preview` on Vertex AI for the deploy; `gemini-3-pro-preview` is the code
  default where allowlisted), reasoning on **Vertex AI**, deployed on **Cloud Run**.
  Explicit in README + video narration.
- **Design (25%)** → Mission-Control web UI (Next.js 16, dark ops aesthetic, streaming timeline,
  hero approval modal, responsive). Built in `web/`; SSE backend in `autosre/server/`.
- **Impact (25%)** → Opening stat: Gartner $5,600/min IT downtime; MTTR identify phase 30+ min.
  AutoSRE collapses triage to the seconds shown on the demo's live header timer (it freezes on
  the verified outcome). README opening + video narration.
- **Idea (25%)** → The refusal is the differentiator: the agent asks permission, obeys a no, and
  logs both the approval and the rejection on Dynatrace's own timeline. That is the one thing the
  track-default "autonomous SRE reads Dynatrace and remediates" build does not have, and the gate
  is framework-enforced (ADK `require_confirmation`), not a prompt.

## Pre-submission verification
- [x] `pytest` passes (36 deterministic offline + 2 live-gated = 38 tests).
- [ ] With a Gemini key set, `tests/test_agent_live.py` passes (full 6-step loop).
- [ ] `python -m autosre.run_agent` (CLI) resolves both `payment_errors` and `latency_spike`.
- [ ] `python -m autosre.server` (SSE backend) + `cd web && npm run dev` (UI) runs full loop.
- [ ] README (rewritten with impact stat + architecture diagram + quickstart) renders correctly on GitHub.
- [ ] VIDEO-SCRIPT.md ≤3:00 with criterion tags (Tech/Design/Impact/Idea).
- [ ] DEVPOST.md draft fields complete.
- [ ] Repo is **public** and LICENSE shows in the About box.
- [ ] **No leaked secrets:** `.env` is gitignored; no hardcoded API keys or tokens.

## Account setup still needed (you)
1. **Gemini key** — fastest path: a free API key from Google AI Studio (no GCP
   billing). Put `GOOGLE_API_KEY=...` in `.env`. For the hosted deploy, use a GCP
   project with Vertex AI enabled instead.
2. **Dynatrace** — a free trial tenant + a Platform token (scopes in README) for the
   `remote` mode demo. Optional: the offline `mock` mode needs no Dynatrace account.
