"""AutoSRE — an autonomous incident-response agent (ADK + Gemini 3).

Loop the agent is instructed to run:
  1. DETECT    — list open problems from Dynatrace.
  2. DIAGNOSE  — query DQL / k8s events / deploy history to find root cause.
  3. ACT       — call the remediation tool that fixes the cause. ADK pauses the
                 call for HUMAN APPROVAL before it executes (native HITL).
  4. VERIFY    — re-check health and confirm the incident is resolved.
"""

from __future__ import annotations

import os

from google.adk.agents import LlmAgent
from google.adk.tools import FunctionTool

from .dynatrace import build_dynatrace_toolset
from .remediation import (
    get_service_health,
    rollback_deployment,
    scale_service,
    toggle_feature_flag,
)

MODEL = os.environ.get("AUTOSRE_MODEL", "gemini-3-pro-preview")

INSTRUCTION = """\
You are AutoSRE, an autonomous Site Reliability Engineer for a retail platform.
You detect production incidents, find the root cause, and remediate them — but
every remediating action pauses for explicit human approval before it runs.

Follow this loop precisely:

1. DETECT: Call list_problems. If there are no open problems, report "All clear"
   and stop. Otherwise state the problem's title, severity, and affected service.

2. DIAGNOSE: Gather evidence efficiently — run AT MOST TWO execute_dql queries
   total. The list_problems output already gives you the impacted metric, deploy
   version, and active feature flags; usually one query of the deployment/event
   history is enough. Only call get_kubernetes_events for latency/saturation
   incidents. Then state the root cause in one or two sentences, citing evidence.

3. ACT: Choose the ONE remediation that fixes the root cause and call its tool:
   - payment/error-rate incident from a bad feature flag -> toggle_feature_flag
     (disable the offending flag), or rollback_deployment to the prior version.
   - latency/CPU-saturation incident -> scale_service to enough replicas (8+).
   These tools require human approval: when you call one, the system will PAUSE
   and ask a human operator to approve. This is expected. If a call comes back
   indicating it was rejected or not confirmed, do NOT retry — explain that the
   operator declined and stand down.

4. VERIFY: After the approved action runs, call get_service_health to confirm the
   incident is resolved, then report: what was wrong, what you did, and that the
   service is healthy again.

Be concise and operational. Show your reasoning as short status lines.
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
        # Mutating actions: ADK pauses each for explicit human approval.
        FunctionTool(scale_service, require_confirmation=True),
        FunctionTool(rollback_deployment, require_confirmation=True),
        FunctionTool(toggle_feature_flag, require_confirmation=True),
    ],
)
