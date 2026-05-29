# Devpost Submission Checklist — AutoSRE (Dynatrace track)

## Required deliverables
- [ ] **Hosted project URL** — Mission-Control web UI (Cloud Run) that streams the full
      incident loop live and allows operator approval. See `web/` + `autosre/server/`.
      URL must work from incognito window (Stage-1 requirement). **TODO: pending Workstream C (deploy).**
- [ ] **Public open-source repo** — push this repo to a **public** GitHub repo.
- [ ] **OSS license detectable in About** — `LICENSE` (MIT) is at repo root;
      GitHub auto-detects it and shows "MIT" in the About sidebar. ✔ already in place.
- [ ] **~3 minute demo video** — follow [VIDEO-SCRIPT.md](VIDEO-SCRIPT.md) (criterion-tagged beats).
- [ ] **Track selected** — **Dynatrace**.
- [ ] **Devpost form** completed — draft fields in [DEVPOST.md](DEVPOST.md).

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
  Detection + diagnosis run entirely on `list_problems`, `execute_dql`, `get_kubernetes_events`.
  Toolset built in `autosre/agent/dynatrace.py`; mode-agnostic (mock/stdio/remote).
- **Gemini 3 + Google Cloud Agent Builder** → ADK `LlmAgent` on `gemini-3-pro-preview`,
  reasoning on **Vertex AI**, deployable to **Vertex AI Agent Engine** (Agent Platform) + Cloud Run.
  Explicit in README + video narration.
- **Design (25%)** → Mission-Control web UI (Next.js 16, dark ops aesthetic, streaming timeline,
  hero approval modal, responsive). Built in `web/`; SSE backend in `autosre/server/`.
- **Impact (25%)** → Opening stat: Gartner $5,600/min IT downtime; MTTR identify phase 30+ min.
  AutoSRE collapses triage to ~10 sec. README README opening + video narration.
- **Idea (25%)** → Sharp framing: "Autonomous, but on your authority." Differentiator vs.
  chatbots (read-only) and reckless auto-fix (human gate is framework-enforced, not prompt).

## Pre-submission verification
- [ ] `pytest` passes (24 deterministic + integration tests).
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
