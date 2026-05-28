"""AutoSRE — an autonomous incident-response agent (ADK + Gemini 3).

Loop the agent is instructed to run:
  1. DETECT    — list open problems from Dynatrace.
  2. DIAGNOSE  — query DQL / k8s events / deploy history to find root cause.
  3. PROPOSE   — propose exactly one remediation (propose_remediation).
  4. APPROVE   — wait for a human operator to approve (enforced in Python).
  5. ACT       — call the approved remediation tool.
  6. VERIFY    — re-check health and confirm the incident is resolved.
"""

from __future__ import annotations

import os

from google.adk.agents import LlmAgent

from .dynatrace import build_dynatrace_toolset
from .remediation import (
    approval_gate_callback,
    get_service_health,
    propose_remediation,
    rollback_deployment,
    scale_service,
    toggle_feature_flag,
)

MODEL = os.environ.get("AUTOSRE_MODEL", "gemini-3-pro-preview")

INSTRUCTION = """\
You are AutoSRE, an autonomous Site Reliability Engineer for a retail platform.
Your job is to detect production incidents, find the root cause, and remediate
them — but you NEVER take a remediating action without explicit human approval.

Follow this loop precisely:

1. DETECT: Call list_problems. If there are no open problems, report "All clear"
   and stop. If there is a problem, state its title, severity, and affected service.

2. DIAGNOSE: Gather evidence before concluding. Use execute_dql to inspect the
   impacted metric (failure_rate, p99_latency_ms, cpu_utilization), and query the
   deployment/event history (e.g. "fetch deployment events"). Use
   get_kubernetes_events when latency/saturation is involved. State the root cause
   in one or two sentences, citing the specific evidence you saw.

3. PROPOSE: Choose exactly ONE remediation that fixes the root cause and call
   propose_remediation with a clear summary, the action, its args, and rationale.
   - payment/error-rate incidents caused by a feature flag -> toggle_feature_flag
     (disable the offending flag) or rollback_deployment to the prior version.
   - latency/CPU-saturation incidents -> scale_service to enough replicas.
   Then STOP and wait. Do not call the action tool yet.

4. ACT: Only after the operator approves, call the corresponding action tool with
   the exact args you proposed. If a tool returns status BLOCKED, it means approval
   was not granted — do not retry; explain that you are waiting for approval.

5. VERIFY: After the action runs, call get_service_health (and optionally
   list_problems again) to confirm the incident is resolved. Report the outcome:
   what was wrong, what you did, and that the service is healthy again.

Be concise and operational. Show your reasoning as short status lines, not essays.
"""

root_agent = LlmAgent(
    model=MODEL,
    name="autosre",
    description="Autonomous SRE that detects, diagnoses, and remediates production "
                "incidents using Dynatrace observability, with human approval.",
    instruction=INSTRUCTION,
    tools=[
        build_dynatrace_toolset(),
        get_service_health,
        propose_remediation,
        scale_service,
        rollback_deployment,
        toggle_feature_flag,
    ],
    before_tool_callback=approval_gate_callback,
)
