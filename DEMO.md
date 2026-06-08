# 3-Minute Demo Runbook

Goal: show a complete, autonomous **detect → diagnose → propose → approve → act →
verify** loop, with the human approval moment front and center.

> The primary demo is the hosted web "Mission Control" UI
> (`https://autosre-ui-vrf7h4n4ra-uc.a.run.app/demo`), and the recorded video follows
> `VIDEO-SCRIPT.md`. This file is the offline CLI runbook, useful as a backup and for
> the real-Dynatrace `stdio` credibility cut.

## Setup (before recording)

```bash
source .venv/bin/activate
# .env has GOOGLE_API_KEY set and DYNATRACE_MCP_MODE=mock (or =remote for a real tenant)
```

Open two terminals (or split panes):
- **Terminal A**: the target service + fault injection.
- **Terminal B**: the agent.

## Script

**[0:00–0:25] The setup.**
"This is AutoSRE — an agent that resolves production incidents using Dynatrace,
but never acts without my approval. Here's a checkout service in production."
```bash
# Terminal A
python -m autosre.target_service.main
```
Show `GET /healthz` returns `ok`.

**[0:25–0:45] Trigger an incident.**
"A bad deploy just went out. Payment errors are spiking."
```bash
# Terminal A (new pane)
curl -X POST localhost:8081/_admin/inject \
     -H 'content-type: application/json' -d '{"fault":"payment_errors"}'
```

**[0:45–2:10] The agent works the incident.**
```bash
# Terminal B
python -m autosre.run_agent
```
Narrate as the tool lines stream:
- "It pulls open problems from **Dynatrace** — 22% checkout failure rate."
- "It runs **DQL** to inspect the failure metric and the deployment history, and
  finds deploy v2.3.1 flipped on the `new_payment_gateway` flag."
- "It proposes a single fix — disable that flag — and **stops**."

**[2:10–2:35] The human in the loop.** ← the money shot
The runner prints `HUMAN APPROVAL REQUIRED` with the exact action.
"Nothing has touched production yet. The action is blocked in code until I
approve. I'll approve it."  → type `y`.

**[2:35–3:00] Resolution.**
- "It executes the approved remediation and re-checks health."
- Show the agent's final report and, in Terminal A, `GET /healthz` → `ok`.
"Detected, diagnosed, and fixed — autonomously, but on my authority."

## Backup / talking points
- Run the **latency** incident instead: inject `latency_spike`; the agent diagnoses
  CPU saturation from k8s events and proposes `scale_service`.
- Reject instead of approve to show the agent standing down without acting.
- Swap `DYNATRACE_MCP_MODE=remote` to show it running against a live Dynatrace tenant.
- `adk web autosre` gives a visual tool-trace if you prefer a UI over the CLI.
