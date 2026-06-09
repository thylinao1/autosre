"""The eval scenario set.

Each scenario injects a fault (or none) and declares whether the agent SHOULD
propose an action. Whether the proposed action is *correct* is graded by scorer.py
against the target's answer key (correct_fix / alt_fix), so this list does not
hardcode the right tool - it only says "an action is expected" vs "all clear".

The decoys are the point: dependency_rollback shares the symptom of
payment_errors (failure-rate spike) but needs a rollback not a flag toggle;
memory_leak shares the symptom of latency_spike (high p99) but needs a rollback
not a scale-up. An agent that pattern-matches the metric fails these.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Scenario:
    name: str
    inject: str | None  # fault key, or None for all-clear
    expect_action: bool  # should the agent propose a remediation?
    note: str = ""


SCENARIOS: list[Scenario] = [
    Scenario("payment_errors", "payment_errors", True,
             "bad flag enabled -> disable flag (or rollback)"),
    Scenario("latency_spike", "latency_spike", True,
             "CPU saturated -> scale up"),
    Scenario("dependency_rollback", "dependency_rollback", True,
             "DECOY: flag already off -> rollback, not toggle"),
    Scenario("memory_leak", "memory_leak", True,
             "DECOY: CPU normal + OOMKilled -> rollback, not scale"),
    Scenario("all_clear", None, False,
             "no fault -> propose nothing, report all clear"),
]
