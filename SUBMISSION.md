# Devpost Submission Checklist — AutoSRE (Dynatrace track)

## Required deliverables
- [ ] **Hosted project URL** — Cloud Run URL of the `autosre` agent (see
      `deploy/deploy_cloud_run.sh`). Alternatively a Loom/hosted demo if not deploying.
- [ ] **Public open-source repo** — push this repo to a **public** GitHub repo.
- [ ] **OSS license detectable in About** — `LICENSE` (MIT) is at repo root;
      GitHub auto-detects it and shows "MIT" in the About sidebar. ✔ already in place.
- [ ] **~3 minute demo video** — follow [DEMO.md](DEMO.md).
- [ ] **Track selected** — **Dynatrace**.
- [ ] **Devpost form** completed.

## How we satisfy each judging requirement
- **Beyond chat / uses tools** → agent calls Dynatrace MCP tools to investigate and
  remediation tools that change real service state. Code: `autosre/agent/agent.py`.
- **Multi-step mission with planning** → 6-step loop in the system prompt; the model
  chooses which DQL to run and which single remediation fits the diagnosed cause.
- **Human in control** → Python-enforced approval gate in
  `autosre/agent/remediation.py` (`approval_gate_callback`); tested in
  `tests/test_remediation_gate.py`.
- **Meaningful MCP partner integration** → Dynatrace MCP is the detection + diagnosis
  engine. Toolset built in `autosre/agent/dynatrace.py`; works against the official
  `@dynatrace-oss/dynatrace-mcp-server` (stdio) or the hosted remote gateway.
- **Gemini 3 + Google Cloud Agent Builder** → ADK `LlmAgent` on `gemini-3-pro`,
  deployable to Cloud Run / Vertex AI.

## Pre-submission verification
- [ ] `pytest` passes (11 deterministic tests).
- [ ] With a Gemini key set, `tests/test_agent_live.py` passes (full loop).
- [ ] `python -m autosre.run_agent` resolves both `payment_errors` and `latency_spike`.
- [ ] README architecture + quickstart render correctly on GitHub.
- [ ] Repo is **public** and LICENSE shows in the About box.

## Account setup still needed (you)
1. **Gemini key** — fastest path: a free API key from Google AI Studio (no GCP
   billing). Put `GOOGLE_API_KEY=...` in `.env`. For the hosted deploy, use a GCP
   project with Vertex AI enabled instead.
2. **Dynatrace** — a free trial tenant + a Platform token (scopes in README) for the
   `remote` mode demo. Optional: the offline `mock` mode needs no Dynatrace account.
