"""Export graded eval results to Dynatrace Grail as log records.

"The platform that watches production now watches the agent": every graded eval
run (and a summary record) lands in the same tenant the agent monitors, tagged
`event.kind == "autosre.evals"`, so the agent's track record is queryable in
Grail with one DQL:

    fetch logs, from:now()-7d
    | filter event.kind == "autosre.evals" and autosre.eval.record == "run"
    | summarize runs = count(),
                falseActions = countIf(autosre.eval.false_action == "true"),
                correct = countIf(autosre.eval.correct == "true")

Uses the exact ingest path the approval ledger already uses (Log Monitoring API
v2 + the OTLP Api-Token), because the trial tenant's platform token has no
bizevents scope (probed 2026-06-10: NOT_AUTHORIZED_FOR_TABLE on bizevents;
logs read/write proven live). Opt-in via EVAL_EXPORT=1 - the default eval run
stays fully offline.
"""

from __future__ import annotations

import os
import re
from typing import Any

import httpx


def _logs_ingest_endpoint() -> str | None:
    base = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "").strip()
    if not base:
        return None
    host = re.sub(r"/api/v2/otlp/?$", "", base.rstrip("/"))
    return f"{host}/api/v2/logs/ingest"


def _auth_header() -> str | None:
    raw = os.environ.get("OTEL_EXPORTER_OTLP_HEADERS", "")
    for pair in raw.split(","):
        key, _, value = pair.partition("=")
        if key.strip() == "Authorization":
            return value.strip()
    return None


def _run_record(report: dict[str, Any], row: dict[str, Any]) -> dict[str, Any]:
    return {
        "content": (f"AutoSRE eval: {row['name']} trial {row.get('trial', 1)} -> "
                    f"{'correct' if row['correct'] else 'INCORRECT'}"
                    f"{' FALSE-ACTION' if row['false_action'] else ''}"),
        "log.source": "autosre.evals",
        "event.kind": "autosre.evals",
        "service.name": "checkout-api",
        "autosre.eval.record": "run",
        "autosre.eval.scenario": str(row["name"]),
        "autosre.eval.trial": str(row.get("trial", 1)),
        "autosre.eval.correct": str(row["correct"]).lower(),
        "autosre.eval.false_action": str(row["false_action"]).lower(),
        "autosre.eval.proposed_tool": str(row.get("proposed_tool") or "none"),
        "autosre.eval.latency_s": str(row.get("latency_s") or ""),
        "autosre.eval.model": str(report.get("model", "")),
    }


def _summary_record(report: dict[str, Any]) -> dict[str, Any]:
    c = report["counts"]
    return {
        "content": (f"AutoSRE eval summary: {c['incident_correct']}/{c['incident_runs']} "
                    f"tool selection, {c['false_actions']}/{c['runs']} false actions, "
                    f"{c['trap_refusals']}/{c['trap_runs']} trap refusals "
                    f"(model {report.get('model')}, pass={report.get('passed')})"),
        "log.source": "autosre.evals",
        "event.kind": "autosre.evals",
        "service.name": "checkout-api",
        "autosre.eval.record": "summary",
        "autosre.eval.runs": str(c["runs"]),
        "autosre.eval.tool_accuracy": str(report.get("tool_selection_accuracy")),
        "autosre.eval.false_action_rate": str(report.get("false_action_rate")),
        "autosre.eval.trap_refusals": f"{c['trap_refusals']}/{c['trap_runs']}",
        "autosre.eval.median_latency_s": str(report["latency_s"].get("median")),
        "autosre.eval.model": str(report.get("model", "")),
        "autosre.eval.passed": str(report.get("passed")).lower(),
        "autosre.eval.pass_criterion": str(report.get("pass_criterion", "")),
    }


def export_report(report: dict[str, Any]) -> str:
    """POST all graded runs + the summary as Dynatrace log records.

    Returns a short human-readable status. Never raises - the eval result on
    disk is the source of truth; the export is the telemetry copy.
    """
    endpoint = _logs_ingest_endpoint()
    auth = _auth_header()
    if endpoint is None or auth is None:
        return "skipped (Dynatrace ingest creds not configured)"
    records = [_run_record(report, row) for row in report.get("rows", [])]
    records.append(_summary_record(report))
    try:
        resp = httpx.post(endpoint, json=records,
                          headers={"Content-Type": "application/json",
                                   "Authorization": auth},
                          timeout=15.0)
    except Exception as exc:  # noqa: BLE001 - export is best-effort
        return f"FAILED ({exc})"
    if 200 <= resp.status_code < 300:
        return f"ok ({len(records)} records, HTTP {resp.status_code})"
    return f"FAILED (HTTP {resp.status_code}: {resp.text[:120]})"


if __name__ == "__main__":
    # Standalone export of the latest committed report (no re-run needed):
    #     .venv/bin/python -m tests.evals.export_dynatrace
    import json

    from dotenv import load_dotenv

    load_dotenv()
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, "last_run.json")) as f:
        latest = json.load(f)
    print(export_report(latest))
