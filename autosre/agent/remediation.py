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


def _target() -> str:
    # Read at call time so tests / deploys can set the URL after import.
    return os.environ.get("TARGET_SERVICE_URL", "http://localhost:8081")


def _post(path: str, payload: dict) -> dict:
    return httpx.post(f"{_target()}{path}", json=payload, timeout=10.0).json()


def get_service_health() -> dict:
    """Read the live health and current configuration of checkout-api.

    Returns version, replica count, feature flags, and whether the service is
    currently healthy. Use this to confirm recovery after a remediation.
    """
    return httpx.get(f"{_target()}/_internal/state", timeout=10.0).json()


def scale_service(replicas: int) -> dict:
    """Scale checkout-api to the given replica count (1..50).

    Requires human approval before it executes.
    """
    return _post("/_admin/scale_service", {"replicas": replicas})


def rollback_deployment(version: str) -> dict:
    """Roll checkout-api back to a previous deploy version.

    Requires human approval before it executes.
    """
    return _post("/_admin/rollback_deployment", {"version": version})


def toggle_feature_flag(name: str, enabled: bool) -> dict:
    """Enable or disable a feature flag on checkout-api.

    Requires human approval before it executes.
    """
    return _post("/_admin/toggle_feature_flag", {"name": name, "enabled": enabled})
