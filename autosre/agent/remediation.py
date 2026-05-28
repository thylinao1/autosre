"""Remediation tools (the ACT step) plus the human-in-the-loop approval gate.

The agent may freely call read/diagnostic tools, but the three mutating actions
(scale_service, rollback_deployment, toggle_feature_flag) are guarded: they will
not run unless a human operator has explicitly approved the pending plan. The
gate is enforced in Python via APPROVAL_GATE — the model cannot talk its way past
it, because only the operator-controlled runner flips the flag.
"""

from __future__ import annotations

import os

import httpx

MUTATING_TOOLS = {"scale_service", "rollback_deployment", "toggle_feature_flag"}

# In-process gate shared between the runner (which a human drives) and the
# before_tool_callback. {"approved": bool, "plan": <last proposed plan>}.
APPROVAL_GATE: dict = {"approved": False, "plan": None}


def _target() -> str:
    # Read at call time so tests / deploys can set the URL after import.
    return os.environ.get("TARGET_SERVICE_URL", "http://localhost:8081")


def _post(path: str, payload: dict) -> dict:
    return httpx.post(f"{_target()}{path}", json=payload, timeout=10.0).json()


# ── Diagnostic helper the agent can call on the target directly ────────────
def get_service_health() -> dict:
    """Read the live health and current configuration of checkout-api.

    Returns version, replica count, feature flags, and whether the service is
    currently healthy. Use this to confirm recovery after a remediation.
    """
    return httpx.get(f"{_target()}/_internal/state", timeout=10.0).json()


# ── The human-in-the-loop proposal step ────────────────────────────────────
def propose_remediation(summary: str, action: str, args: dict, rationale: str) -> dict:
    """Propose a single remediation for human approval. Does NOT execute anything.

    Call this exactly once after you have diagnosed the root cause. Pick ONE
    action from: scale_service (args: {"replicas": int}),
    rollback_deployment (args: {"version": str}),
    toggle_feature_flag (args: {"name": str, "enabled": bool}).

    Args:
        summary: One-line description of the incident being fixed.
        action: The remediation tool you intend to call next.
        args: The exact arguments you will pass to that tool.
        rationale: Why this action resolves the diagnosed root cause.
    """
    if action not in MUTATING_TOOLS:
        return {"status": "ERROR",
                "message": f"action must be one of {sorted(MUTATING_TOOLS)}"}
    APPROVAL_GATE["plan"] = {"summary": summary, "action": action,
                             "args": args, "rationale": rationale}
    APPROVAL_GATE["approved"] = False
    return {"status": "AWAITING_HUMAN_APPROVAL",
            "proposed": APPROVAL_GATE["plan"],
            "message": "Plan recorded. Execution is blocked until a human operator "
                       "approves. Do not retry the action tool until approval is granted."}


# ── The three guarded actions ───────────────────────────────────────────────
def scale_service(replicas: int) -> dict:
    """Scale checkout-api to the given replica count (1..50). Requires approval."""
    return _post("/_admin/scale_service", {"replicas": replicas})


def rollback_deployment(version: str) -> dict:
    """Roll checkout-api back to a previous deploy version. Requires approval."""
    return _post("/_admin/rollback_deployment", {"version": version})


def toggle_feature_flag(name: str, enabled: bool) -> dict:
    """Enable/disable a feature flag on checkout-api. Requires approval."""
    return _post("/_admin/toggle_feature_flag", {"name": name, "enabled": enabled})


# ── Enforcement: ADK before_tool_callback ───────────────────────────────────
def approval_gate_callback(tool, args, tool_context):  # noqa: ANN001 - ADK signature
    """Block mutating tools unless a human has approved the pending plan."""
    if tool.name not in MUTATING_TOOLS:
        return None  # read/diagnostic/propose tools always allowed
    if not APPROVAL_GATE.get("approved"):
        return {
            "status": "BLOCKED",
            "reason": "Human approval required. You must call propose_remediation "
                      "and wait for the operator to approve before executing this action.",
        }
    # Single-use approval: consume it so a second action needs fresh approval.
    APPROVAL_GATE["approved"] = False
    return None
