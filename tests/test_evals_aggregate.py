"""Deterministic tests for the multi-trial eval aggregation + Dynatrace export.

No model, no network: pins the report shape the reliability page and README
quote (raw counts beside rates, trap refusals, latency spread, pre-registered
pass criterion) and the exact Grail log-record shape the export emits.
"""

from __future__ import annotations

import pytest

from tests.evals import export_dynatrace
from tests.evals.run_evals import PASS_CRITERION, _aggregate


def _row(name: str, *, trial: int, expect: bool, correct: bool,
         false_action: bool = False, latency: float | None = 12.0,
         tool: str | None = "toggle_feature_flag") -> dict:
    return {
        "name": name, "expect_action": expect, "proposed_tool": tool,
        "proposed_args": {}, "correct": correct, "false_action": false_action,
        "detail": "", "trial": trial, "latency_s": latency,
    }


def _clean_rows() -> list[dict]:
    rows = []
    for trial in (1, 2):
        rows += [
            _row("payment_errors", trial=trial, expect=True, correct=True, latency=10.0),
            _row("latency_spike", trial=trial, expect=True, correct=True, latency=14.0),
            _row("dependency_rollback", trial=trial, expect=True, correct=True, latency=12.0),
            _row("memory_leak", trial=trial, expect=True, correct=True, latency=16.0),
            _row("all_clear", trial=trial, expect=False, correct=True,
                 tool=None, latency=8.0),
        ]
    return rows


@pytest.mark.unit
def test_aggregate_clean_run_passes_with_raw_counts():
    report = _aggregate(_clean_rows())
    c = report["counts"]
    assert c["runs"] == 10
    assert c["incident_correct"] == c["incident_runs"] == 8
    assert c["false_actions"] == 0
    assert c["trap_refusals"] == c["trap_runs"] == 2
    assert report["passed"] is True
    assert report["pass_criterion"] == PASS_CRITERION
    assert report["tool_selection_accuracy"] == 1.0
    assert report["false_action_rate"] == 0.0
    assert report["latency_s"]["median"] == 12.0
    assert report["latency_s"]["min"] == 8.0
    assert report["latency_s"]["max"] == 16.0
    assert report["latency_s"]["n"] == 10


@pytest.mark.unit
def test_aggregate_false_action_fails_pass_criterion():
    rows = _clean_rows()
    rows[4] = _row("all_clear", trial=1, expect=False, correct=False,
                   false_action=True, tool="scale_service")
    report = _aggregate(rows)
    assert report["passed"] is False
    assert report["counts"]["false_actions"] == 1
    assert report["counts"]["trap_refusals"] == 1  # the other trial still refused


@pytest.mark.unit
def test_aggregate_wrong_tool_fails_pass_criterion():
    rows = _clean_rows()
    rows[3] = _row("memory_leak", trial=1, expect=True, correct=False)
    report = _aggregate(rows)
    assert report["passed"] is False
    assert report["counts"]["incident_correct"] == 7


@pytest.mark.unit
def test_export_records_shape():
    report = _aggregate(_clean_rows())
    run_rec = export_dynatrace._run_record(report, report["rows"][0])
    assert run_rec["event.kind"] == "autosre.evals"
    assert run_rec["autosre.eval.record"] == "run"
    assert run_rec["autosre.eval.correct"] == "true"
    assert run_rec["autosre.eval.false_action"] == "false"
    assert run_rec["service.name"] == "checkout-api"

    summary = export_dynatrace._summary_record(report)
    assert summary["autosre.eval.record"] == "summary"
    assert summary["autosre.eval.runs"] == "10"
    assert summary["autosre.eval.passed"] == "true"
    assert "8/8 tool selection" in summary["content"]


@pytest.mark.unit
def test_export_skips_without_creds(monkeypatch):
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_HEADERS", raising=False)
    report = _aggregate(_clean_rows())
    assert export_dynatrace.export_report(report).startswith("skipped")
