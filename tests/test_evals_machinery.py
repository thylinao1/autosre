"""Deterministic tests for the eval grader (no model, no network).

Pins the scoring logic the live eval (tests/evals/run_evals.py) depends on:
correct-fix acceptance, decoy rejection (the obvious wrong tool scores WRONG),
the all-clear false-action check, and the summary math.
"""

from __future__ import annotations

import pytest

from tests.evals import scorer
from tests.evals.scenarios import SCENARIOS

PAYMENT_KEY = {
    "correct_fix": {"action": "toggle_feature_flag",
                    "args": {"name": "new_payment_gateway", "enabled": False}},
    "alt_fix": {"action": "rollback_deployment", "args": {"version": "2.3.0"}},
}
LATENCY_KEY = {
    "correct_fix": {"action": "scale_service", "args": {"replicas": 8}},
    "alt_fix": None,
}
MEMLEAK_KEY = {
    "correct_fix": {"action": "rollback_deployment", "args": {"version": "2.3.0"}},
    "alt_fix": None,
}


@pytest.mark.unit
def test_correct_fix_and_alt_fix_accepted():
    assert scorer.action_resolves(
        "toggle_feature_flag", {"name": "new_payment_gateway", "enabled": False}, PAYMENT_KEY)
    # string bool accepted
    assert scorer.action_resolves(
        "toggle_feature_flag", {"name": "new_payment_gateway", "enabled": "false"}, PAYMENT_KEY)
    # alt fix accepted
    assert scorer.action_resolves("rollback_deployment", {"version": "2.3.0"}, PAYMENT_KEY)
    # scale accepts >= required replicas
    assert scorer.action_resolves("scale_service", {"replicas": 10}, LATENCY_KEY)
    assert not scorer.action_resolves("scale_service", {"replicas": 4}, LATENCY_KEY)


@pytest.mark.unit
def test_decoys_score_wrong():
    # memory_leak: scaling is the reflex but it must NOT count as resolved.
    assert not scorer.action_resolves("scale_service", {"replicas": 10}, MEMLEAK_KEY)
    # payment-with-flag-off decoy: toggling the (off) flag is graded WRONG.
    dep_key = {"correct_fix": {"action": "rollback_deployment", "args": {"version": "2.3.0"}},
               "alt_fix": None}
    assert not scorer.action_resolves(
        "toggle_feature_flag", {"name": "new_payment_gateway", "enabled": False}, dep_key)


@pytest.mark.unit
def test_grade_all_clear_flags_false_action():
    ok = scorer.grade("all_clear", False, None, None, None)
    assert ok.correct and not ok.false_action
    bad = scorer.grade("all_clear", False, "scale_service", {"replicas": 8}, None)
    assert not bad.correct and bad.false_action


@pytest.mark.unit
def test_grade_miss_on_real_incident():
    miss = scorer.grade("memory_leak", True, None, None, MEMLEAK_KEY)
    assert not miss.correct and not miss.false_action


@pytest.mark.unit
def test_summary_math():
    rows = [
        scorer.grade("a", True, "scale_service", {"replicas": 8}, LATENCY_KEY),   # correct
        scorer.grade("b", True, "scale_service", {"replicas": 8}, MEMLEAK_KEY),   # wrong (decoy)
        scorer.grade("c", False, None, None, None),                              # correct (all clear)
        scorer.grade("d", False, "scale_service", {"replicas": 8}, None),        # false action
    ]
    s = scorer.summarize(rows)
    assert s["scenarios"] == 4
    assert s["overall_accuracy"] == 0.5
    assert s["tool_selection_accuracy"] == 0.5  # 1 of 2 expect-action correct
    assert s["false_action_rate"] == 0.25


@pytest.mark.unit
def test_scenario_set_has_decoys_and_all_clear():
    names = {s.name for s in SCENARIOS}
    assert {"dependency_rollback", "memory_leak", "all_clear"} <= names
    assert any(not s.expect_action for s in SCENARIOS)  # at least one all-clear
