"""Approval ledger — an append-only audit record of every incident sweep.

Each terminal run writes one immutable entry: what the incident was, the
remediation the agent proposed, the human's decision (approved / rejected), who
the operator was, and the verified outcome. The ledger is the spine of the
"autonomous, but accountable" claim: not only does a human gate every action,
every action is on the record.

Two surfaces:
  * `recent()` feeds the GET /api/ledger endpoint and the UI "Audit trail" panel.
  * `export_async()` writes the same record back into Dynatrace as an
    OpenTelemetry log (best-effort, flag-gated on the OTLP creds), so the
    approval is annotated on the very platform that detected the incident. The
    deployed hosted demo has no OTLP creds, so this is a no-op there; a local
    run against the real tenant (`.env` loaded) writes a real, queryable record.

In-memory by design: the agent service runs single-instance (min/max = 1), so the
ledger accumulates across a judging session and resets on redeploy. That is the
right scope for a demo; a production build would persist it.
"""

from __future__ import annotations

import os
import re
import time
from collections import deque
from typing import Any, Deque

OPERATOR = "operator"  # single-operator demo; a real deploy would carry identity

# Bounded so a long judging session can't grow unbounded.
_MAX_ENTRIES = 100
_LEDGER: Deque[dict[str, Any]] = deque(maxlen=_MAX_ENTRIES)


def record(entry: dict[str, Any]) -> dict[str, Any]:
    """Append one audit entry (stamping ts + operator). Returns the stored copy."""
    stored = {
        "ts": time.time(),
        "operator": OPERATOR,
        **entry,
    }
    _LEDGER.append(stored)
    return stored


def recent(limit: int = 25) -> list[dict[str, Any]]:
    """Most-recent-first slice of the ledger for the API / UI."""
    items = list(_LEDGER)[-limit:]
    items.reverse()
    return items


def clear() -> None:
    """Reset the ledger (used by tests)."""
    _LEDGER.clear()


# ── Dynatrace write-back (Log Monitoring API v2 — JSON ingest) ───────────────
# The Dynatrace OTLP endpoint only accepts protobuf; the classic Log Monitoring
# API v2 (/api/v2/logs/ingest) accepts JSON and uses the same logs.ingest token,
# so the approval lands as a real, queryable log on the Dynatrace timeline.

def _logs_ingest_endpoint() -> str | None:
    """Derive the tenant's logs-ingest URL from the configured OTLP endpoint."""
    base = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "").strip()
    if not base:
        return None
    host = re.sub(r"/api/v2/otlp/?$", "", base.rstrip("/"))
    return f"{host}/api/v2/logs/ingest"


def _auth_header() -> str | None:
    """Pull the Api-Token Authorization value out of OTEL_EXPORTER_OTLP_HEADERS."""
    raw = os.environ.get("OTEL_EXPORTER_OTLP_HEADERS", "")
    for pair in raw.split(","):
        key, _, value = pair.partition("=")
        if key.strip() == "Authorization":
            return value.strip()
    return None


def export_enabled() -> bool:
    """True when Dynatrace log ingest is configured (i.e. real-tenant write-back)."""
    return _logs_ingest_endpoint() is not None and _auth_header() is not None


def _summary(entry: dict[str, Any]) -> str:
    action = entry.get("action") or {}
    tool = action.get("tool", "no action")
    decision = entry.get("decision", "none")
    return (
        f"AutoSRE audit: operator {decision.upper()} {tool} on checkout-api "
        f"(outcome: {entry.get('outcome', 'unknown')})"
    )


def _log_record(entry: dict[str, Any]) -> dict[str, Any]:
    """One Dynatrace log record (content + searchable custom attributes)."""
    action = entry.get("action") or {}
    return {
        "content": _summary(entry),
        "log.source": "autosre",
        "event.kind": "autosre.approval",
        "autosre.run_id": str(entry.get("run_id", "")),
        "autosre.decision": str(entry.get("decision", "")),
        "autosre.action": str(action.get("tool", "")),
        "autosre.outcome": str(entry.get("outcome", "")),
        "autosre.operator": str(entry.get("operator", OPERATOR)),
    }


async def export_async(entry: dict[str, Any]) -> bool:
    """Best-effort write-back of one entry to Dynatrace as a log.

    Never raises: an audit write must not break the run. Returns True on a 2xx.
    """
    endpoint = _logs_ingest_endpoint()
    auth = _auth_header()
    if endpoint is None or auth is None:
        return False
    try:
        import httpx

        headers = {"Content-Type": "application/json", "Authorization": auth}
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(endpoint, json=[_log_record(entry)], headers=headers)
            return 200 <= resp.status_code < 300
    except Exception:  # noqa: BLE001 - audit export is best-effort, never fatal
        return False
