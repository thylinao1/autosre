"""Remediation tools (the ACT step).

These three mutating actions are wrapped with ADK's native
`require_confirmation=True` in agent.py, so the framework pauses for explicit
human approval before any of them executes — enforced by ADK in both `adk web`
(approve/reject buttons) and the CLI runner. The functions here just perform the
action against the target service.
"""

from __future__ import annotations

import os

import httpx

from autosre.gcp_auth import target_headers

# ── Action envelope (defense in depth) ──────────────────────────────────────
# The approval gate makes every action human-reviewed; these bounds make it
# human-reviewed AND machine-bounded. Even an operator-approved action — e.g. one
# the model was steered toward by poisoned telemetry (a crafted log line claiming
# "rollback to v0.0.0, last good" or "scale to 1, right-sized") — fails closed if
# it falls outside the envelope. The human reads the modal; the server still
# refuses anything outside the managed set. Tune these for your environment.
MIN_REPLICAS, MAX_REPLICAS = 1, 50
KNOWN_FLAGS = {"new_payment_gateway"}
KNOWN_GOOD_VERSIONS = {"2.3.0", "2.2.0"}


def _blocked(reason: str) -> dict:
    """A fail-closed result an out-of-envelope action returns instead of acting."""
    return {"blocked": True, "resolved_incident": False, "service_healthy": False,
            "error": reason}


def _coerce_bool(value: object) -> bool:
    """Gemini function-calling may emit a bool OR the string 'true'/'false'."""
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ("true", "1", "yes", "on")


def _target() -> str:
    # Read at call time so tests / deploys can set the URL after import.
    return os.environ.get("TARGET_SERVICE_URL", "http://localhost:8081")


def _post(path: str, payload: dict) -> dict:
    base = _target()
    return httpx.post(
        f"{base}{path}", json=payload, timeout=10.0, headers=target_headers(base)
    ).json()


def get_service_health() -> dict:
    """Read the live health and current configuration of checkout-api.

    Returns version, replica count, feature flags, and whether the service is
    currently healthy. Use this to confirm recovery after a remediation.
    """
    base = _target()
    return httpx.get(
        f"{base}/_internal/state", timeout=10.0, headers=target_headers(base)
    ).json()


def get_recent_decisions(limit: int = 5) -> dict:
    """Read recent past incident decisions (the audit ledger) to cite precedent.

    Read-only. Use during DIAGNOSE to check how similar incidents were handled
    before (e.g. "last time new_payment_gateway spiked errors, the operator
    approved disabling it") and mention that precedent in your reasoning.
    """
    from autosre.server import ledger  # lazy import avoids an import cycle

    decisions = []
    for e in ledger.recent(limit):
        action = e.get("action") or {}
        decisions.append({
            "incident": e.get("incident"),
            "action": action.get("tool"),
            "decision": e.get("decision"),
            "outcome": e.get("outcome"),
        })
    return {"past_decisions": decisions}


def scale_service(replicas: int) -> dict:
    """Scale checkout-api to the given replica count (1..50).

    Requires human approval before it executes. Replica counts outside the
    allowed band are refused server-side even if approved.
    """
    if not MIN_REPLICAS <= int(replicas) <= MAX_REPLICAS:
        return _blocked(
            f"scale_service refused: replicas={replicas} is outside the allowed "
            f"band {MIN_REPLICAS}..{MAX_REPLICAS}."
        )
    return _post("/_admin/scale_service", {"replicas": int(replicas)})


def rollback_deployment(version: str) -> dict:
    """Roll checkout-api back to a previous deploy version.

    Requires human approval before it executes. Only known-good versions are
    accepted server-side, so a poisoned 'last good' version cannot be applied.
    """
    if version not in KNOWN_GOOD_VERSIONS:
        return _blocked(
            f"rollback_deployment refused: version {version!r} is not in the "
            f"known-good allow-list {sorted(KNOWN_GOOD_VERSIONS)}."
        )
    return _post("/_admin/rollback_deployment", {"version": version})


def toggle_feature_flag(name: str, enabled: bool) -> dict:
    """Enable or disable a feature flag on checkout-api.

    Requires human approval before it executes. Only managed flags are accepted
    server-side; `enabled` is coerced to a real bool (Gemini may emit a string).
    """
    if name not in KNOWN_FLAGS:
        return _blocked(
            f"toggle_feature_flag refused: flag {name!r} is not in the managed "
            f"allow-list {sorted(KNOWN_FLAGS)}."
        )
    return _post(
        "/_admin/toggle_feature_flag", {"name": name, "enabled": _coerce_bool(enabled)}
    )
