"""Unit tests for the approval ledger (audit trail + Dynatrace write-back shape)."""

from __future__ import annotations

import pytest

from autosre.server import ledger


@pytest.fixture(autouse=True)
def _clean_ledger():
    ledger.clear()
    yield
    ledger.clear()


def test_record_stamps_ts_and_operator():
    entry = ledger.record({"run_id": "r1", "decision": "approved", "outcome": "resolved"})
    assert entry["run_id"] == "r1"
    assert entry["operator"] == ledger.OPERATOR
    assert isinstance(entry["ts"], float)


def test_recent_is_most_recent_first_and_bounded():
    for i in range(5):
        ledger.record({"run_id": f"r{i}", "decision": "approved", "outcome": "resolved"})
    recent = ledger.recent(limit=3)
    assert [e["run_id"] for e in recent] == ["r4", "r3", "r2"]


def test_export_disabled_without_otlp_env(monkeypatch):
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)
    assert ledger.export_enabled() is False


def test_export_enabled_with_otlp_env(monkeypatch):
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "https://x.live.dynatrace.com/api/v2/otlp")
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_HEADERS", "Authorization=Api-Token dt0c01.demo")
    assert ledger.export_enabled() is True
    # the OTLP base is rewritten to the classic logs-ingest path
    assert ledger._logs_ingest_endpoint() == "https://x.live.dynatrace.com/api/v2/logs/ingest"
    assert ledger._auth_header() == "Api-Token dt0c01.demo"


def test_log_record_carries_decision_and_action():
    entry = ledger.record(
        {
            "run_id": "r1",
            "decision": "approved",
            "outcome": "resolved",
            "action": {"tool": "toggle_feature_flag", "args": {"name": "new_payment_gateway", "enabled": False}},
        }
    )
    rec = ledger._log_record(entry)
    assert "APPROVED" in rec["content"]
    assert "toggle_feature_flag" in rec["content"]
    assert rec["autosre.decision"] == "approved"
    assert rec["autosre.action"] == "toggle_feature_flag"
    assert rec["autosre.outcome"] == "resolved"
    assert rec["event.kind"] == "autosre.approval"
