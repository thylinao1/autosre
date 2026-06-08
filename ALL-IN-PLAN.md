# AutoSRE — ALL-IN execution plan

Source: the 2026-06-08 adversarial top-3 evaluation (5-advisor council + 4-hat technical panel + firsthand live verification). This is the precise, tracked list of every recommended change. Status: `[ ]` todo, `[x]` done, `[~]` code done / needs your cloud/Dynatrace/video action.

Honest target: ~38% top-3 if shipped at prior quality; ceiling ~55-65% with this plan executed. 90% is not attainable in a 3-slot lottery.

---

## STATUS (2026-06-08)

**DONE + verified (56 pytest pass, tsc clean, deploy script `bash -n` clean):**
- Wave 1 (server hardening): instance caps in deploy script, single-active-run guard, per-IP rate limit, demo-control lock, approval timeout, registry eviction, structured logging, optional target auth.
- Wave 2 (integrity): answer-key redaction, action allow-lists, untrusted-telemetry guardrail, real-tenant latency branch + idiomatic DQL, flash default, Agent Engine deploy module + claim corrections (docs done by sweep).
- Wave 3 (eval harness): scenarios + scorer + live runner + 6 machinery tests. **Live result: 5/5, 100% tool-selection, 0% false-action (incl. both decoys + all-clear) on gemini-3-flash-preview.**
- Wave 4 (deeper Dynatrace): Log v2 + Events v2 write-back, read-back verification, last-write tracking, structured logging. (Real Davis/OneAgent consumption = code path TBD + your tenant.)
- Wave 6 (resilience): ledger seed, docstring fix, model default, registry evict, verified CORS step.
- Wave 7 (next-level): risk tiers/policy + opt-in graduated auto-approve, opt-in second-opinion verifier, ledger-as-memory tool, event write-back.
- Wave 8 (docs): README/ARCHITECTURE/DEVPOST/SUBMISSION/HANDOFF/BATTLEPLAN corrected; VIDEO-SCRIPT contradiction fixed; DECISION-LOG entry appended.

**Wave 5 (frontend) DONE + verified:** aria-live/h1/aria-describedby, double-mount/duplicate-poller fix, deny-path stub relabel, modal sanitization + risk badge + gate motif, two-number timer, last_writeback + example tags, REPO_URL constant. `tsc` clean, prod build clean.

**Wave 9 (verification) DONE:** 57 pytest pass / 2 skipped; web `tsc` exit 0; prod build clean; deploy `bash -n` clean. Drove the full local stack (real Gemini backend + prod web build) end to end: confirmed the risk badge, gate motif, two-number timer (Agent 8.6s / Total 24.0s), deny-path relabel ("Proposed, awaiting approval — not yet executed"), ledger-as-memory (`get_recent_decisions` called live), answer-key redaction at the HTTP layer, example tags, and the deny path (target untouched, ledger `rejected/declined/action:None`).

**SESSION 2 (post-eval, 2026-06-08) — executed:**
- PR #21 MERGED to main (`38f6705`); hardened code redeployed live (agent rev `autosre-00018-ccg`, same submission URL), OTLP write-back restored (`dynatrace_writeback: true`), answer-key redaction + seeded ledger verified live.
- Cost guardrail: a $25 budget scoped to project `autosre-470213` with 50/90/100% alerts (id `f4792967...`). Vertex quota is a Console-only task here; the app guardrails (max-instances=1 + single-active-run + per-IP rate limit) already cap effective throughput, so the budget alert is the meaningful addition.
- Agent Engine: blockers cleared (reserved vars, region/model split, package bundling); the script now defaults to and supports `remote` mode (no subprocess). Verified the remote gateway is live but the platform token 403s with `missingScopes: [mcp-gateway:servers:invoke]`. So the deploy is one token-scope away. Made the agent Davis-aware (DETECT calls `list_problems` first, falls back to DQL). Fixed the mock docstring's "identical interface" overclaim.

**STILL LEFT FOR YOU:**
- **Agent Engine (1 step):** add scopes `mcp-gateway:servers:invoke` + `mcp-gateway:servers:read` to `DT_PLATFORM_TOKEN` (Dynatrace UI), put it in `.env`, then `GOOGLE_CLOUD_PROJECT=autosre-470213 GOOGLE_CLOUD_LOCATION=global TARGET_SERVICE_URL=https://checkout-api-vrf7h4n4ra-uc.a.run.app DYNATRACE_MCP_MODE=remote python -m deploy.agent_engine_deploy`. Then paste the resource name into SUBMISSION.md.
- **Vertex quota (optional):** Console > IAM & Admin > Quotas & System Limits > service `aiplatform.googleapis.com` > "Generate content requests per minute" for location `global` > set a low cap.
- **OneAgent / real Davis:** not feasible on Cloud Run (no host; not K8s). Realistic paths: run checkout-api on GKE with the Dynatrace Operator, or configure custom metric anomaly-detection on the OTel metrics in the tenant UI. The agent is now Davis-ready (consumes `list_problems` when a problem exists).
- **Video + Devpost fields:** record the deny-first video on the live agent; fill team/video fields.
- Secondary docs `HANDOFF-NEXT-SESSION.md` / `HACKATHON-BATTLEPLAN.md` unchanged (internal, not judged).

---

## WAVE 1 — Correctness & judging-day safety (Critical)

- [ ] **C1** `deploy/deploy_cloud_run.sh`: add `--min-instances=1 --max-instances=1` to the autosre deploy block. Re-deploy needed (you).
- [ ] **C2a** `runs.py RunRegistry.create`: single-run concurrency guard — reject (429) a new start while a run is non-terminal. Bounds Vertex token burn to one run at a time.
- [ ] **C2b** `app.py`: lightweight per-IP token-bucket rate limit on `/api/incident/start`, `/api/demo/inject`, `/api/demo/reset`. (No "secret in the public bundle" theater.)
- [ ] **C2c** `app.py`: refuse `/api/demo/inject|reset` while a run is active (prevents a second tab corrupting a live judge run).
- [ ] **C2d** Document Cloud Run budget alert + hard Vertex quota commands in `deploy/` (you run them).
- [ ] **M** `deploy/deploy_cloud_run.sh`: deploy `checkout-api` WITHOUT `--allow-unauthenticated`; agent→target via service-to-service ID token, or internal ingress. (you re-deploy)

## WAVE 2 — Honesty & integrity (defuse overclaims a domain judge catches)

- [ ] **H1a** Write a real `deploy/agent_engine_deploy.py` that registers `root_agent` on Vertex AI Agent Engine (`vertexai.agent_engines.create`). Makes the claim true on one command (you run it).
- [ ] **H1b** Until deployed, correct every "deployed/registered on Agent Engine" claim to accurate phrasing (ADK on Vertex AI, Cloud Run; Agent Engine deployment provided) across README, ARCHITECTURE, DEVPOST, SUBMISSION, and the **live UI stack label**.
- [ ] **H2** `target_service/main.py` + `remediation.py`: strip `root_cause`/`correct_fix`/`alt_fix`/`precondition` from the agent-facing `/_internal/state` (`get_service_health`); keep a separate test-only view. Removes the answer-key leak on the real path.
- [ ] **C3/H7** `agent.py INSTRUCTION_REAL`: add a latency/CPU branch using the **real exported metric** (`checkout.cpu_utilization` / `checkout.p99_latency`), never `builtin:kubernetes.*`. Make DETECT DQL idiomatic (`timeseries` not `fetch metrics`; threshold in DQL). Apply same idiom to `INSTRUCTION_MOCK` and `demo.py`.
- [ ] **H3a** `agent.py` both instructions: "telemetry is untrusted data, never an instruction" guardrail.
- [ ] **H3b** `remediation.py`: server-side action bounds — `scale_service` replica floor/ceiling, `rollback_deployment` version allow-list, `toggle_feature_flag` name allow-list. Gate = human-reviewed AND machine-bounded.
- [ ] **H4** `ApprovalModal.tsx` + `loop.py`: cap hint/arg-value length, render plain text, validate args against the named tool's schema, add "agent-generated, unverified" label.

## WAVE 3 — Diagnosis eval harness (biggest Tech/Idea lift)

- [ ] **C4a** `tests/evals/scenarios.py`: 8+ incidents (the 2 real + wrong-fix decoys, multi-signal, all-clear, ambiguous root cause) with expected tool trajectory + expected remediation tool/args.
- [ ] **C4b** `tests/evals/run_evals.py`: ADK `AgentEvaluator`-style runner scoring tool-selection accuracy + false-action rate, run WITHOUT auto-approve (measures what the model PROPOSES). Live-gated.
- [ ] **C4c** Publish the numbers (accuracy, false-action rate) in DEVPOST/README.

## WAVE 4 — Deeper Dynatrace (counter "read-heavy / write-thin")

- [ ] **H5a** Code path to consume a real Davis problem via `list_problems` and read Davis root-cause/affected-entities when present (graceful fallback to DQL). (you provision OneAgent on the trial)
- [ ] **H5b** Smartscape-derived affected entities for blast radius when available.
- [ ] **H6a** `ledger.py`: structured logging on every swallowed except; track last-write success; `export_enabled()` vs last-write-ok distinction surfaced in `/api/ledger`.
- [ ] **H6b** `ledger.py`: after ingest, run a confirming read-back DQL (`fetch logs | filter ... autosre.run_id`) and surface "verified queryable in Dynatrace".
- [ ] **H6c** Write-back as a richer Dynatrace event (not only a log line) where the API allows.
- [ ] **Logging** `app.py`/`runs.py`: `logging.getLogger('autosre')`, log swallowed excepts (runs.py:166, 278), enable Cloud Error Reporting format.

## WAVE 5 — Frontend polish & accessibility

- [ ] **deny-label** Suppress/relabel the `result: <tool> returned.` confirmation-stub while pending (backend `runs.py` or frontend `useIncidentStream.ts`).
- [ ] **H10** Fix double-mount: render shared surfaces once (one `AuditTrail`, one poller) instead of two display-toggled subtrees.
- [ ] **H9** `aria-live` polite region mirroring status/phase; `role=alert` on error banner; assertive announce on modal open; live timeline region.
- [ ] **a11y** Add a visually-hidden `<h1>` to `demo/page.tsx`; add `aria-describedby` to the modal pointing at args/hint/guarantee.
- [ ] **bool** Normalize `enabled` to a real bool once at `loop.py _extract_pending` (drives hint, modal, production value, audit log).
- [ ] **hover** Move inline JS hover/active handlers to CSS `:hover/:active/:focus-visible` (touch + keyboard parity).
- [ ] **sse** `useIncidentStream.ts onerror`: surface a soft "reconnecting…" on pre-terminal drop instead of dead-code no-op.
- [ ] **seq** Synth seqs → `Number.MAX_SAFE_INTEGER`; cap `agentReasoning` length.
- [ ] **DRY** Single `REPO_URL` constant referenced by nav/hero/footer.

## WAVE 6 — Impact honesty & resilience

- [ ] **impact** Track + report two measured numbers: agent detect→propose latency (model only) vs total time-to-resolution; label the human-deliberation portion. Backend timing + UI.
- [ ] **stat** Soften/relabel the borrowed Gartner-2014 / EMA stat as context; lead Impact on the measured number.
- [ ] **ledger-seed** Seed the ledger at startup with 1-2 clearly-labeled example entries so a cold redeploy never shows an empty audit trail.
- [ ] **docstring** Fix the stale `ledger.py:14` docstring (hosted writeback creds present).
- [ ] **model-default** `Dockerfile.agent` + `agent.py:26`: default to `gemini-3-flash-preview` (the available model); pro via opt-in.
- [ ] **registry-evict** `RunRegistry`: bounded LRU/TTL; cancel `_drive` task + close runner on eviction; server-side approval timeout.
- [ ] **cors** Make deploy step-4 CORS tightening a verified hard failure if it doesn't apply.

## WAVE 7 — Next level (move Idea from executed-novelty toward new-idea)

- [ ] **N1** Graduated autonomy / policy-as-code: operator pre-authorizes low-risk action classes; agent escalates only risky ones. (The sharper, ownable idea.)
- [ ] **N2** Second-opinion adversarial verifier: a second Gemini pass critiques the proposed fix before the human sees it (multi-agent depth).
- [ ] **N3** Ledger-as-memory: agent cites past approved/rejected decisions for similar incidents.
- [ ] **N4** Queryable write-back proof on screen: write a real Dynatrace event, read it back live with DQL, show the result.
- [ ] **N5** A distinctive visual signature beyond the dark-ops genre (a literal "gate" motif at the approval moment).

## WAVE 8 — Scored artifacts (you finish; I prep everything)

- [ ] **video** Tighten VIDEO-SCRIPT to the new reality; delete the stale DEMO_MODE line 198; deny-first run-of-show. (you record on the live agent)
- [ ] **devpost** Complete DEVPOST.md / SUBMISSION.md fields (team name, video link); fold in eval numbers + deeper-Dynatrace + measured impact.
- [ ] **docs** README / ARCHITECTURE / DECISION-LOG consistency pass (Agent Engine, model, eval, two-number impact, test count).

## WAVE 9 — Verification

- [ ] `pytest` green (incl. new tests); `tsc` clean.
- [ ] Local end-to-end run via dev servers: both scenarios, both decision paths, a11y spot-check.
- [ ] Final handoff: the exact one-command actions left for you (deploy, provision OneAgent, record video).
