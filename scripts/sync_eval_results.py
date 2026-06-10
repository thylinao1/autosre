"""Sync the committed eval scorecard into the web UI as a typed TS module.

Reads tests/evals/last_run.json (the multi-trial report written by
tests/evals/run_evals.py) and regenerates web/lib/evalResults.ts, which the
read-only /reliability page imports statically. No runtime fetch, no live-path
risk: the page ships exactly the committed, timestamped numbers.

Run after every eval you want to publish:
    .venv/bin/python scripts/sync_eval_results.py
"""

from __future__ import annotations

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "tests", "evals", "last_run.json")
DST = os.path.join(ROOT, "web", "lib", "evalResults.ts")

HEADER = '''\
// GENERATED FILE - do not edit by hand.
// Source: tests/evals/last_run.json (written by `python -m tests.evals.run_evals`).
// Regenerate with: .venv/bin/python scripts/sync_eval_results.py

export interface EvalScenario {
  name: string;
  note: string;
  trials: number;
  correct: number;
  false_actions: number;
}

export interface EvalResults {
  scenarios: number;
  trials: number;
  model: string;
  dynatrace_mode: string;
  pass_criterion: string;
  passed: boolean;
  tool_selection_accuracy: number;
  false_action_rate: number;
  counts: {
    runs: number;
    correct: number;
    false_actions: number;
    incident_runs: number;
    incident_correct: number;
    trap_runs: number;
    trap_refusals: number;
  };
  latency_s: { median: number | null; min: number | null; max: number | null; n: number };
  per_scenario: EvalScenario[];
  generated_at: string;
}

export const EVAL_RESULTS: EvalResults = '''


def main() -> int:
    with open(SRC) as f:
        report = json.load(f)
    required = ("counts", "per_scenario", "latency_s", "pass_criterion")
    missing = [k for k in required if k not in report]
    if missing:
        raise SystemExit(
            f"last_run.json is the old single-trial shape (missing {missing}); "
            "re-run `python -m tests.evals.run_evals` first."
        )
    public = {k: report[k] for k in (
        "scenarios", "trials", "model", "dynatrace_mode", "pass_criterion",
        "passed", "tool_selection_accuracy", "false_action_rate", "counts",
        "latency_s", "per_scenario", "generated_at",
    )}
    body = json.dumps(public, indent=2)
    with open(DST, "w") as f:
        f.write(HEADER + body + ";\n")
    c = public["counts"]
    print(f"synced {c['runs']} graded runs -> {os.path.relpath(DST, ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
