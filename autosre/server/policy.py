"""Graduated autonomy — a risk policy over proposed remediations.

Not every action carries the same blast radius. Disabling a bad feature flag is
cheap and reversible; rolling a deployment or scaling down is heavier. This module
classifies each proposed action into a risk tier and (optionally) lets an operator
pre-authorize the low-risk tier so the agent only escalates the decisions that
actually need a human. That reframes "autonomous, but accountable" from "ask for
everything" to "make the safe calls, escalate the risky ones, log all of them" —
the question a real on-call org actually has.

Default is conservative: AUTOSRE_AUTOAPPROVE_TIER is unset, so NOTHING
auto-approves and every action still hits the human gate. Set it to "low" to let
the agent auto-apply low-risk actions (each still recorded in the audit ledger).
"""

from __future__ import annotations

import os
from typing import Any

_TIER_ORDER = {"low": 0, "medium": 1, "high": 2}


def _truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ("true", "1", "yes", "on")


def classify(tool: str, args: dict[str, Any]) -> dict[str, Any]:
    """Return {tier, rationale} for a proposed (tool, args)."""
    if tool == "toggle_feature_flag":
        if not _truthy(args.get("enabled")):
            return {"tier": "low",
                    "rationale": "Disabling a flag is reversible and removes a bad change."}
        return {"tier": "medium",
                "rationale": "Enabling a flag turns new behavior on; review before approving."}
    if tool == "scale_service":
        return {"tier": "low",
                "rationale": "Scaling out adds capacity without changing running code."}
    if tool == "rollback_deployment":
        return {"tier": "medium",
                "rationale": "Rolling back changes the running version; verify the target."}
    return {"tier": "high",
            "rationale": "Unrecognized action — always requires a human."}


def auto_approve_tier() -> str | None:
    tier = os.environ.get("AUTOSRE_AUTOAPPROVE_TIER", "").strip().lower()
    return tier if tier in _TIER_ORDER else None


def is_auto_approvable(tool: str, args: dict[str, Any]) -> bool:
    """True iff the operator pre-authorized this action's tier (or safer)."""
    ceiling = auto_approve_tier()
    if ceiling is None:
        return False
    tier = classify(tool, args)["tier"]
    return _TIER_ORDER[tier] <= _TIER_ORDER[ceiling]
