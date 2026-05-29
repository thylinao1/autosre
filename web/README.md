# AutoSRE Mission Control UI

The web frontend for AutoSRE — an autonomous incident-response agent that diagnoses Dynatrace problems and fixes them on your authority.

## Design direction

Dark "ops war-room / military command" aesthetic. JetBrains Mono for telemetry, Inter for UI labels. Electric cyan accent for live states, amber for approval, red for AVAILABILITY incidents, green for recovery. Three-column ops panel: Problem Card (left) — Agent Timeline (centre, the live feed) — DQL Evidence (right). No gradients. No card grids. No emoji.

## Running locally (mock mode — no backend required)

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:3000`. The app uses built-in Next.js route handlers that replay the full incident sequence from CONTRACT.md §2.9 including the approval pause. No backend or Dynatrace credentials needed.

Select an incident type (Payment Errors / Latency Spike), click Run, watch the agent stream live, approve or reject when the modal appears.

## Connecting to the live backend

Set one environment variable before starting:

```
NEXT_PUBLIC_AGENT_BASE_URL=https://autosre-agent-xxxx.run.app
```

With this set all six CONTRACT.md endpoints proxy to the real agent service. Without it the app falls back to mock mode automatically.

```bash
NEXT_PUBLIC_AGENT_BASE_URL=https://autosre-agent-xxxx.run.app npm run dev
```

Or create `.env.local`:

```
NEXT_PUBLIC_AGENT_BASE_URL=https://autosre-agent-xxxx.run.app
```

## Mock vs live — one env var

| `NEXT_PUBLIC_AGENT_BASE_URL` | Mode |
|---|---|
| Not set or empty | Mock — Next.js route handlers replay CONTRACT.md happy path on a timer |
| Set to agent Cloud Run URL | Live — UI proxies all requests to the real agent; SSE streams from Gemini 3 via Dynatrace MCP |

The SSE event shapes, approval round-trip, and demo control endpoints are identical in both modes — guaranteed by CONTRACT.md §5.

## Production build

```bash
npm run build
npm start
```

## What the UI does

1. Problem Card — reads `tool_result.response.problems[0]` from `query-problems`; severity badge, affected service, observed metric vs baseline. Animates to green on `final` with `service_healthy && incident_resolved`.
2. Streaming Timeline — one entry per SSE event: step phase markers (DETECT / DIAGNOSE / ACT / VERIFY), tool_call, tool_result, agent_message reasoning chunks. Phase progress bar at the bottom.
3. DQL Evidence Panel — shows the `execute-dql` query and `response.records` table once DIAGNOSE runs, plus the agent's reasoning block.
4. Approval Modal — surfaces on `approval_request`: exact tool, args, hint. Blocks until operator clicks. POSTs `{confirmation_id, approved}` back. No auto-approve.
5. Demo Controls — select fault type, click Run (calls `/api/incident/start`), Reset between takes.

## Responsive breakpoints

- 1440px — full three-column ops panel
- 768px — three-column compressed
- 375px — single-column stacked mobile
