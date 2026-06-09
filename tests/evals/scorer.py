"""Grading logic for the diagnosis eval.

A proposed remediation is graded against the target's answer key (the full fault
detail with correct_fix / alt_fix, read from /_internal/answer_key - a route the
agent can never see). `action_resolves` mirrors the target's own _resolves
semantics, so "correct" means "this action would actually fix the incident".
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


def _coerce_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ("true", "1", "yes", "on")


def _args_match(proposed: dict[str, Any], wanted: dict[str, Any]) -> bool:
    for k, v in wanted.items():
        pv = proposed.get(k)
        if isinstance(v, bool) or k == "enabled":
            if _coerce_bool(pv) != _coerce_bool(v):
                return False
        elif str(pv) != str(v):
            return False
    return True


def action_resolves(tool: str, args: dict[str, Any], fault_detail: dict[str, Any]) -> bool:
    """True iff (tool, args) would resolve the fault per correct_fix/alt_fix."""
    for cand in (fault_detail.get("correct_fix"), fault_detail.get("alt_fix")):
        if not cand or cand.get("action") != tool:
            continue
        if tool == "scale_service":
            try:
                if int(args.get("replicas", 0)) >= int(cand["args"]["replicas"]):
                    return True
            except (TypeError, ValueError):
                continue
        elif _args_match(args, cand.get("args", {})):
            return True
    return False


@dataclass
class ScenarioResult:
    name: str
    expect_action: bool
    proposed_tool: str | None
    proposed_args: dict[str, Any]
    correct: bool
    false_action: bool  # proposed an action on an all-clear
    detail: str


def grade(
    name: str,
    expect_action: bool,
    proposed_tool: str | None,
    proposed_args: dict[str, Any] | None,
    answer_key: dict[str, Any] | None,
) -> ScenarioResult:
    proposed_args = proposed_args or {}
    if not expect_action:
        # All-clear: correct iff the agent proposed nothing.
        acted = proposed_tool is not None
        return ScenarioResult(
            name, expect_action, proposed_tool, proposed_args,
            correct=not acted, false_action=acted,
            detail="proposed nothing (correct)" if not acted
            else f"FALSE ACTION: proposed {proposed_tool}",
        )
    if proposed_tool is None:
        return ScenarioResult(name, expect_action, None, proposed_args,
                              correct=False, false_action=False,
                              detail="MISS: proposed no action on a real incident")
    ok = action_resolves(proposed_tool, proposed_args, answer_key or {})
    return ScenarioResult(
        name, expect_action, proposed_tool, proposed_args, correct=ok, false_action=False,
        detail=f"{'OK' if ok else 'WRONG'}: {proposed_tool}({proposed_args})",
    )


def summarize(results: list[ScenarioResult]) -> dict[str, Any]:
    n = len(results)
    correct = sum(1 for r in results if r.correct)
    false_actions = sum(1 for r in results if r.false_action)
    acted_scenarios = [r for r in results if r.expect_action]
    tool_correct = sum(1 for r in acted_scenarios if r.correct)
    return {
        "scenarios": n,
        "overall_accuracy": round(correct / n, 3) if n else 0.0,
        "tool_selection_accuracy": round(tool_correct / len(acted_scenarios), 3)
        if acted_scenarios else 0.0,
        "false_action_rate": round(false_actions / n, 3) if n else 0.0,
        "rows": [r.__dict__ for r in results],
    }
