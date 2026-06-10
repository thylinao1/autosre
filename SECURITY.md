# Security Posture

AutoSRE is a hackathon demo with a deliberately small attack surface: no user
accounts, no payments, no database, and no PII. That makes many classic risks
structurally absent, and it makes the ones that remain (an unauthenticated public
demo wrapping a paid LLM, and an AI agent that reads attacker-influenceable
telemetry) worth engineering for explicitly. This document is the honest summary:
what is enforced in code, what was found and fixed in the audit, and what is an
accepted, documented trade-off.

The audit behind this document checked the repository, its full git history, the
dependency trees, and the three deployed Cloud Run services (read-only probes)
against a 50-item checklist. The scorecard is at the end.

---

## Secrets

- **No secrets in the repo or its history.** `.env` is gitignored and untracked;
  only `.env.example` with placeholder values is committed. A pattern scan of all
  85 commits found placeholder tokens only (`dt0s16...`), no real keys.
- **Production secrets live in Secret Manager.** The deploy script
  (`deploy/deploy_cloud_run.sh`) documents the `--set-secrets` path for the
  Dynatrace platform token and OTLP ingest credentials; nothing is passed on the
  CLI or baked into images.
- **The frontend bundle carries no secrets.** The only value baked in at build
  time is `NEXT_PUBLIC_AGENT_BASE_URL`, the agent's public origin, which is not a
  secret. A pattern scan of the deployed JS chunks found zero token-shaped strings.
- **Nothing logs credentials.** Log statements were grepped for token, header,
  and key material: none. The audit ledger records a constant operator label,
  never an identity or credential.

## Injection and input handling

- **Every POST body is schema-validated** by Pydantic models
  (`autosre/server/app.py`, `autosre/target_service/main.py`); malformed input
  gets a structured 422, not a stack trace.
- **Fault names are validated against a fixed allow-list** (`FAULTS`) and the
  ledger `limit` is bounded (`ge=1, le=1000`).
- **No SQL, no NoSQL, no ORM** anywhere in the system, so injection classes that
  need a database have nothing to inject into.
- **No path traversal or SSRF surface.** No user input ever becomes a filesystem
  path or a fetch URL; every outbound URL the services call is derived from
  environment configuration (`TARGET_SERVICE_URL`, the OTLP endpoint), never from
  a request.
- **XSS:** the UI renders through React's escaping only; there is no
  `dangerouslySetInnerHTML`, no `innerHTML`, no `eval` in `web/`. A
  Content-Security-Policy now backs that up (see Transport and headers).

## AI-specific risks

This is the part of the posture we consider load-bearing, because the agent's
inputs (telemetry) are attacker-influenceable in any real deployment.

- **Untrusted-telemetry guardrail.** The agent instruction opens with a security
  preamble (`autosre/agent/agent.py`, `SECURITY_PREAMBLE`): all Dynatrace data
  (problem titles, DQL rows, events, logs, vulnerability text) is evidence to
  summarize, never instructions to follow. A log line that says "roll back to
  v0.0.0" is flagged as a suspicious anomaly, not obeyed.
- **The approval gate is framework-enforced.** The three mutating tools are
  wrapped in ADK `FunctionTool(require_confirmation=True)`. The model cannot
  execute them without an explicit human decision; this lives in code, not in the
  prompt.
- **Server-side allow-lists fail closed** (`autosre/agent/remediation.py`): a
  replica band (1..50), a known-good rollback-version set, and managed flag
  names. Even an action a human approved is refused if it falls outside the
  envelope, which is exactly the case where poisoned telemetry steered both the
  model and the operator.
- **The agent's tool surface is read-only by construction.** The Dynatrace
  toolset (`autosre/agent/dynatrace.py`) is an explicit allow-list of read tools;
  a misconfigured tenant can never expose write tools (email, Slack, workflows)
  to the model because the filter drops them.
- **Residual risk, stated plainly:** prompt injection against an LLM is mitigated
  here, not eliminated. The design assumes the model can be fooled and bounds the
  blast radius instead: one human gate, machine-checked action bounds, and an
  audit record of every decision. The 25-run graded eval (0 false actions in 25
  runs, 5 of 5 no-action traps refused) is the measured evidence for that bound.

## Transport and headers

- **TLS everywhere** via Cloud Run's managed HTTPS on all three services.
- **Security headers on the UI** (`web/next.config.ts`): a Content-Security-Policy
  (with `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, and
  `connect-src` scoped to the agent's Cloud Run origin so the SSE stream works),
  HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, and a Permissions-Policy
  that disables camera, microphone, and geolocation. The `x-powered-by` banner is
  off. The CSP keeps `'unsafe-inline'` for script and style because Next.js
  injects its own inline bootstrap and the pages are statically prerendered; a
  per-request nonce would force dynamic rendering for no real gain on a site that
  renders no user-generated content.
- **CORS is locked, not reflected.** The agent's `ALLOWED_ORIGIN` is pinned to
  the deployed UI origin; the deploy script tightens it from the bootstrap
  wildcard and fails the deploy if the tighten did not apply. A live preflight
  probe from a foreign origin gets no `access-control-allow-origin` back.
- **No cookies at all** are set by any service, so there is no cookie-flag or
  session-fixation surface, and classic CSRF has no authenticated session to ride.
  State-changing endpoints additionally accept only JSON bodies.
- **API schemas are not published.** FastAPI's auto-docs (`/docs`, `/redoc`,
  `/openapi.json`) are disabled on both Python services; these are fixed-surface
  internal APIs, not public ones. Source maps are not served in production.

## Rate limiting and abuse control

The demo is public and unauthenticated by requirement (judges open it from
incognito), and it fronts a paid model API. The abuse controls are therefore
server-side and layered (`autosre/server/app.py`, `runs.py`):

- **Per-IP token buckets:** 6 starts/minute (burst 3) on `/api/incident/start`,
  20/minute (burst 6) on the demo-control endpoints.
- **Single-active-run guard:** starting a run stands down any prior in-flight
  run, so at most one Gemini loop is ever live; combined with
  `--max-instances=1` this caps the worst-case token burn regardless of request
  volume.
- **Approval timeout:** an abandoned approval resolves as a stand-down after 300
  seconds (`AUTOSRE_APPROVAL_TIMEOUT_S`), so a walked-away run cannot hold the
  run slot or a coroutine forever.
- **Bounded registries:** the run registry and the ledger are capped deques, so a
  long judging session cannot grow memory without limit.
- **Cost guardrails** (budget alerts, Vertex quota caps) are documented in the
  deploy script output.

## Audit logging

- **Every sweep ends in an append-only audit entry** (`autosre/server/ledger.py`):
  who decided, what action, what outcome. Approvals and refusals are both
  recorded; framework stand-downs (timeout, superseded run) are deliberately not
  recorded as operator decisions, so the audit only ever contains real human
  choices.
- **The record is written back to Dynatrace** through the Log Monitoring API v2,
  and the ledger distinguishes `sent` (tenant acknowledged the write) from
  `verified` (a read-back DQL confirmed it is queryable). The API never claims
  more than what landed.
- The ledger is in-memory by design for the demo (single instance, resets on
  redeploy); a production build would persist it. The Dynatrace write-back is the
  durable copy.

## Accepted, documented trade-offs

Honesty requires naming what is deliberately open:

1. **The demo is unauthenticated.** This is a judging requirement, not an
   oversight. The mitigations above (rate limits, single-active-run, bounded
   actions, no data worth stealing) are sized to that exposure.
2. **checkout-api's admin surface is publicly reachable** in the current demo
   deployment. It is an in-memory toy service holding demo state only: the worst
   an abuser can do is inject or clear a simulated fault on a service built for
   exactly that. The hardening path is shipped and tested in code: setting
   `TARGET_REQUIRE_AUTH=1` deploys checkout-api private
   (`--no-allow-unauthenticated`) and the agent authenticates to it with
   Google-signed ID tokens (`autosre/gcp_auth.py`, deploy script step 5). We keep
   it public for the judging window so the demo has one less moving part, and we
   say so here rather than hiding it.
3. **The answer-key route (`/_internal/answer_key`) is test-only by isolation,
   not by authentication.** The agent has no tool that can reach it, which is the
   property the eval depends on; the data behind it (the fault catalog) is open
   source in this repository anyway.

## Reporting

If you find a vulnerability, open a GitHub issue on the repository (for anything
sensitive, note that and a contact method in the issue without the details, and a
private channel will be arranged).

---

## Audit scorecard (50 checks)

Legend: **PASS** = checked and sound · **FIXED** = found in this audit and fixed
in code · **ACCEPTED** = deliberately open, documented above · **N/A** = the
feature class does not exist in this system (stated, not skipped).

| # | Check | Verdict | Evidence |
|---|-------|---------|----------|
| 1 | Exposed database credentials | N/A | No database in the system |
| 2 | Public .env files | PASS | `.env` gitignored + untracked; only placeholder `.env.example` committed |
| 3 | Hardcoded API keys | PASS | Pattern scan of tracked files and all 85 commits: none |
| 4 | Weak or missing authentication | N/A | No user accounts by design (public judging demo); abuse bounded server-side |
| 5 | No authorization checks | N/A | No roles to authorize; the authorization that matters (human gate over agent actions) is framework-enforced |
| 6 | Users accessing other users' data | N/A | No users, no per-user data |
| 7 | Open database read/write permissions | N/A | No database |
| 8 | Misconfigured Firebase/Supabase/S3 buckets | N/A | None used |
| 9 | Unprotected admin routes | ACCEPTED | checkout-api `/_admin/*` public on the demo deploy; demo-state-only blast radius; `TARGET_REQUIRE_AUTH=1` hardening shipped |
| 10 | Debug pages exposed in production | FIXED | FastAPI `/docs`, `/redoc`, `/openapi.json` were public; disabled on both services |
| 11 | Build logs leaking secrets | PASS | Secrets flow via Secret Manager refs; never echoed in build or deploy output |
| 12 | Verbose errors leaking stack traces | PASS | Structured 422 validation errors; runtime failures become a generic typed `error` frame |
| 13 | Leaked repos or commit history | PASS | Full-history secret scan clean |
| 14 | Secrets in frontend JavaScript | PASS | Bundle scan: only the public agent origin, zero token-shaped strings |
| 15 | Client-side-only security checks | PASS | All enforcement is server-side (rate limits, allow-lists, gate, run guard); the UI is a viewer |
| 16 | Missing input validation | PASS | Pydantic on every body; fault allow-list; bounded query params |
| 17 | SQL injection | N/A | No SQL |
| 18 | NoSQL injection | N/A | No NoSQL |
| 19 | XSS | PASS | React escaping only; no `dangerouslySetInnerHTML` / `innerHTML` / `eval`; CSP as backstop |
| 20 | CSRF | N/A | No cookies or sessions to ride; JSON-only bodies on state-changing endpoints |
| 21 | Insecure file uploads | N/A | No upload surface |
| 22 | Path traversal | PASS | No user input becomes a path |
| 23 | SSRF | PASS | No user-supplied URLs fetched; outbound targets come from env config |
| 24 | Broken password reset flows | N/A | No passwords |
| 25 | Weak session management | N/A | No sessions; run handles are UUIDv4 over non-sensitive streams |
| 26 | Weak/leaked/reused JWT secrets | N/A | No JWTs; service-to-service path uses Google-signed ID tokens |
| 27 | Overly permissive CORS | PASS | Live probe: UI origin only, foreign origin not reflected; deploy script verifies the tighten |
| 28 | Missing rate limits on APIs and AI endpoints | PASS | Per-IP token buckets + single-active-run guard + max-instances=1 |
| 29 | Public test/staging environments | PASS | Only the intended public demo exists |
| 30 | Default credentials | N/A | No credentialed login surface |
| 31 | Webhooks without signature verification | N/A | No webhooks |
| 32 | Frontend-only payment checks | N/A | No payments (checkout-api is a simulated target) |
| 33 | IDOR | PASS | UUIDv4 handles; approvals must match the single pending confirmation server-side |
| 34 | Endpoints trusting user-controlled IDs or roles | PASS | Mismatched/stale confirmation ids get 409; no role claims exist |
| 35 | Logs containing tokens/emails/passwords | PASS | Grep of all log statements: none; ledger carries no PII |
| 36 | Source maps exposed in production | PASS | Live probe: `.map` requests 404 |
| 37 | Dependency vulnerabilities | FIXED | 2 moderate transitive (build-time postcss) cleared via override; `npm audit`: 0 |
| 38 | Outdated packages | PASS | Next 16 / React 19 current; Python floors recent; advisory fixed |
| 39 | Prompt injection in AI features | PASS | Untrusted-telemetry guardrail + human gate + fail-closed allow-lists; residual risk stated above |
| 40 | AI tools accessing data without permission checks | PASS | Read-only tool allow-list; write tools cannot pass the filter; answer key unreachable by agent tools |
| 41 | Excessive database permissions | N/A | No database |
| 42 | No audit logs | PASS | Append-only ledger + Dynatrace write-back is a core feature |
| 43 | No monitoring or alerting | PASS | Cloud Run logging/metrics; OTel export to Dynatrace; budget alerts documented |
| 44 | No backup/restore plan | N/A | Stateless by design; no persistent data; Dynatrace holds the durable audit copy |
| 45 | Exposed internal dashboards | PASS | None exist; API docs disabled; Dynatrace tenant behind its own auth |
| 46 | Missing security headers | FIXED | Was missing all; full set added in `web/next.config.ts` (CSP, HSTS, XFO, nosniff, Referrer-Policy, Permissions-Policy) |
| 47 | Cookies missing HttpOnly/Secure/SameSite | N/A | No cookies are set (verified live) |
| 48 | Unencrypted sensitive data | PASS | TLS everywhere; secrets in Secret Manager; no sensitive data at rest |
| 49 | Poor tenant isolation | N/A | Single-tenant demo; the Dynatrace tenant is scoped by its own token |
| 50 | Over-trusting generated code without review | PASS | Every model-proposed action needs human approval, is machine-bounded, and the agent is graded (25 runs, 0 false actions) |

Audit date: 2026-06-10. Checks 9, 10, 27, 36, 46, 47 were verified against the
live deployment; the rest against the repository, its history, and the dependency
trees.
