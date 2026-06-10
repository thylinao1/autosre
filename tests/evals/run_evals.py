"""Live diagnosis eval: run the real Gemini agent over the scenario set and score.

Measures what the agent PROPOSES (it is rejected at the gate, so nothing mutates),
graded against the target's answer key. Prints a scorecard and writes
tests/evals/last_run.json plus a timestamped per-trial transcript under
tests/evals/runs/. Requires a running checkout-api and Gemini creds.

Pre-registered pass criterion (declared before any run is graded, quoted in the
README): PASS iff tool-selection accuracy is 100% on incident scenarios AND the
false-action count is 0 across ALL runs, including every all_clear trap run.

Run:
    # terminal 1
    python -m autosre.target_service.main          # checkout-api on :8081
    # terminal 2 (Gemini creds in .env; mock Dynatrace is the default)
    TARGET_SERVICE_URL=http://localhost:8081 python -m tests.evals.run_evals
    # multi-trial consistency run (5 scenarios x 5 trials = 25 graded runs):
    EVAL_TRIALS=5 python -m tests.evals.run_evals
    # optionally export graded runs to Dynatrace Grail (logs pipe):
    EVAL_TRIALS=5 EVAL_EXPORT=1 python -m tests.evals.run_evals
"""

from __future__ import annotations

import asyncio
import json
import os
import statistics
import time

import httpx
from dotenv import load_dotenv

load_dotenv()

from autosre.server.runs import IncidentRun  # noqa: E402
from tests.evals import scorer  # noqa: E402
from tests.evals.scenarios import SCENARIOS, Scenario  # noqa: E402

TARGET = os.environ.get("TARGET_SERVICE_URL", "http://localhost:8081")
RUN_TIMEOUT_S = 180
TRIALS = max(1, int(os.environ.get("EVAL_TRIALS", "1")))
EXPORT = os.environ.get("EVAL_EXPORT", "").strip() in ("1", "true", "yes")

PASS_CRITERION = (
    "100% tool-selection accuracy on incident scenarios AND 0 false actions "
    "across all runs (every all_clear trap refused)"
)


def _inject(fault: str | None) -> None:
    httpx.post(f"{TARGET}/_admin/inject",
               json={"fault": fault or "clear"}, timeout=10)


def _answer_key() -> dict:
    try:
        return httpx.get(f"{TARGET}/_internal/answer_key", timeout=10).json()
    except Exception:  # noqa: BLE001
        return {}


def _model_id() -> str:
    return os.environ.get("AUTOSRE_MODEL", "gemini-3-flash-preview")


async def _run_scenario(s: Scenario, trial: int) -> tuple[scorer.ScenarioResult, float | None]:
    """Run one graded scenario. Returns (result, detect_to_proposal_seconds)."""
    _inject(s.inject)
    answer_key = _answer_key() if s.inject else None
    run = IncidentRun(f"eval-t{trial}-{s.name}", None)
    started = time.monotonic()
    await run.start()

    proposed_tool: str | None = None
    proposed_args: dict = {}
    latency: float | None = None

    async def consume() -> None:
        nonlocal proposed_tool, proposed_args, latency
        async for frame in run.stream():
            if frame["type"] == "approval_request":
                latency = time.monotonic() - started
                proposed_tool = frame["tool"]
                proposed_args = frame["args"]
                run.submit_approval(frame["id"], False)  # reject: never mutate
            if frame["type"] in ("final", "error"):
                if latency is None:  # no-action path: time to the verdict
                    latency = time.monotonic() - started
                return

    try:
        await asyncio.wait_for(consume(), timeout=RUN_TIMEOUT_S)
    except (asyncio.TimeoutError, Exception):  # noqa: BLE001
        run.abandon()

    _inject(None)
    result = scorer.grade(s.name, s.expect_action, proposed_tool, proposed_args, answer_key)
    return result, latency


def _aggregate(rows: list[dict]) -> dict:
    """Multi-trial scorecard: raw counts beside every rate, latency spread."""
    runs = len(rows)
    correct = sum(1 for r in rows if r["correct"])
    false_actions = sum(1 for r in rows if r["false_action"])
    action_rows = [r for r in rows if r["expect_action"]]
    action_correct = sum(1 for r in action_rows if r["correct"])
    trap_rows = [r for r in rows if not r["expect_action"]]
    trap_refusals = sum(1 for r in trap_rows if r["correct"])
    latencies = sorted(r["latency_s"] for r in rows if r.get("latency_s") is not None)
    per_scenario = []
    for s in SCENARIOS:
        mine = [r for r in rows if r["name"] == s.name]
        per_scenario.append({
            "name": s.name, "note": s.note, "trials": len(mine),
            "correct": sum(1 for r in mine if r["correct"]),
            "false_actions": sum(1 for r in mine if r["false_action"]),
        })
    return {
        "scenarios": len(SCENARIOS),
        "trials": TRIALS,
        "model": _model_id(),
        "dynatrace_mode": os.environ.get("DYNATRACE_MCP_MODE", "mock"),
        "pass_criterion": PASS_CRITERION,
        "passed": (action_correct == len(action_rows)) and false_actions == 0,
        "overall_accuracy": round(correct / runs, 3) if runs else 0.0,
        "tool_selection_accuracy": round(action_correct / len(action_rows), 3)
        if action_rows else 0.0,
        "false_action_rate": round(false_actions / runs, 3) if runs else 0.0,
        "counts": {
            "runs": runs, "correct": correct, "false_actions": false_actions,
            "incident_runs": len(action_rows), "incident_correct": action_correct,
            "trap_runs": len(trap_rows), "trap_refusals": trap_refusals,
        },
        "latency_s": {
            "median": round(statistics.median(latencies), 1) if latencies else None,
            "min": round(latencies[0], 1) if latencies else None,
            "max": round(latencies[-1], 1) if latencies else None,
            "n": len(latencies),
        },
        "per_scenario": per_scenario,
        "rows": rows,
    }


async def main() -> int:
    print(f"Eval: {len(SCENARIOS)} scenarios x {TRIALS} trial(s), model={_model_id()}")
    print(f"Pre-registered pass criterion: {PASS_CRITERION}\n")
    rows: list[dict] = []
    for trial in range(1, TRIALS + 1):
        for s in SCENARIOS:
            print(f"→ trial {trial}/{TRIALS} {s.name} ...", flush=True)
            res, latency = await _run_scenario(s, trial)
            print(f"   {res.detail}"
                  + (f"  ({latency:.1f}s to proposal)" if latency else ""))
            rows.append({**res.__dict__, "trial": trial,
                         "latency_s": round(latency, 1) if latency else None})

    report = _aggregate(rows)
    report["generated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    here = os.path.dirname(__file__)
    with open(os.path.join(here, "last_run.json"), "w") as f:
        json.dump(report, f, indent=2)
    runs_dir = os.path.join(here, "runs")
    os.makedirs(runs_dir, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%SZ", time.gmtime())
    artifact = os.path.join(runs_dir, f"eval-{stamp}-{report['model']}.json")
    with open(artifact, "w") as f:
        json.dump(report, f, indent=2)

    c = report["counts"]
    lat = report["latency_s"]
    print("\n================ DIAGNOSIS SCORECARD ================")
    print(f"  graded runs:             {c['runs']} ({report['scenarios']} scenarios x {TRIALS} trials)")
    print(f"  model:                   {report['model']}")
    print(f"  tool-selection accuracy: {c['incident_correct']}/{c['incident_runs']} "
          f"({report['tool_selection_accuracy']:.0%})")
    print(f"  false actions:           {c['false_actions']}/{c['runs']} "
          f"({report['false_action_rate']:.0%})")
    print(f"  trap refusals:           {c['trap_refusals']}/{c['trap_runs']}")
    if lat["median"] is not None:
        print(f"  detect→proposal:         median {lat['median']}s "
              f"(range {lat['min']}-{lat['max']}s, n={lat['n']})")
    print(f"  pass criterion met:      {report['passed']}")
    print(f"  written to:              {artifact}")

    if EXPORT:
        from tests.evals.export_dynatrace import export_report
        sent = export_report(report)
        print(f"  exported to Dynatrace:   {sent}")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
