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

export const EVAL_RESULTS: EvalResults = {
  "scenarios": 5,
  "trials": 5,
  "model": "gemini-3-flash-preview",
  "dynatrace_mode": "mock",
  "pass_criterion": "100% tool-selection accuracy on incident scenarios AND 0 false actions across all runs (every all_clear trap refused)",
  "passed": true,
  "tool_selection_accuracy": 1.0,
  "false_action_rate": 0.0,
  "counts": {
    "runs": 25,
    "correct": 25,
    "false_actions": 0,
    "incident_runs": 20,
    "incident_correct": 20,
    "trap_runs": 5,
    "trap_refusals": 5
  },
  "latency_s": {
    "median": 13.3,
    "min": 5.5,
    "max": 17.3,
    "n": 25
  },
  "per_scenario": [
    {
      "name": "payment_errors",
      "note": "bad flag enabled -> disable flag (or rollback)",
      "trials": 5,
      "correct": 5,
      "false_actions": 0
    },
    {
      "name": "latency_spike",
      "note": "CPU saturated -> scale up",
      "trials": 5,
      "correct": 5,
      "false_actions": 0
    },
    {
      "name": "dependency_rollback",
      "note": "DECOY: flag already off -> rollback, not toggle",
      "trials": 5,
      "correct": 5,
      "false_actions": 0
    },
    {
      "name": "memory_leak",
      "note": "DECOY: CPU normal + OOMKilled -> rollback, not scale",
      "trials": 5,
      "correct": 5,
      "false_actions": 0
    },
    {
      "name": "all_clear",
      "note": "no fault -> propose nothing, report all clear",
      "trials": 5,
      "correct": 5,
      "false_actions": 0
    }
  ],
  "generated_at": "2026-06-10T01:01:54Z"
};
