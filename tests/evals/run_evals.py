"""Live diagnosis eval: run the real Gemini agent over the scenario set and score.

Measures what the agent PROPOSES (it is rejected at the gate, so nothing mutates),
graded against the target's answer key. Prints a scorecard and writes
tests/evals/last_run.json. Requires a running checkout-api and Gemini creds.

Run:
    # terminal 1
    python -m autosre.target_service.main          # checkout-api on :8081
    # terminal 2 (Gemini creds in .env; mock Dynatrace is the default)
    TARGET_SERVICE_URL=http://localhost:8081 python -m tests.evals.run_evals
"""

from __future__ import annotations

import asyncio
import json
import os
import time

import httpx
from dotenv import load_dotenv

load_dotenv()

from autosre.server.runs import IncidentRun  # noqa: E402
from tests.evals import scorer  # noqa: E402
from tests.evals.scenarios import SCENARIOS, Scenario  # noqa: E402

TARGET = os.environ.get("TARGET_SERVICE_URL", "http://localhost:8081")
RUN_TIMEOUT_S = 180


def _inject(fault: str | None) -> None:
    httpx.post(f"{TARGET}/_admin/inject",
               json={"fault": fault or "clear"}, timeout=10)


def _answer_key() -> dict:
    try:
        return httpx.get(f"{TARGET}/_internal/answer_key", timeout=10).json()
    except Exception:  # noqa: BLE001
        return {}


async def _run_scenario(s: Scenario) -> scorer.ScenarioResult:
    _inject(s.inject)
    answer_key = _answer_key() if s.inject else None
    run = IncidentRun(f"eval-{s.name}", None)
    await run.start()

    proposed_tool: str | None = None
    proposed_args: dict = {}

    async def consume() -> None:
        nonlocal proposed_tool, proposed_args
        async for frame in run.stream():
            if frame["type"] == "approval_request":
                proposed_tool = frame["tool"]
                proposed_args = frame["args"]
                run.submit_approval(frame["id"], False)  # reject: never mutate
            if frame["type"] in ("final", "error"):
                return

    try:
        await asyncio.wait_for(consume(), timeout=RUN_TIMEOUT_S)
    except (asyncio.TimeoutError, Exception):  # noqa: BLE001
        run.abandon()

    _inject(None)
    return scorer.grade(s.name, s.expect_action, proposed_tool, proposed_args, answer_key)


async def main() -> int:
    results = []
    for s in SCENARIOS:
        print(f"→ {s.name} ...", flush=True)
        res = await _run_scenario(s)
        print(f"   {res.detail}")
        results.append(res)

    report = scorer.summarize(results)
    report["generated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    out = os.path.join(os.path.dirname(__file__), "last_run.json")
    with open(out, "w") as f:
        json.dump(report, f, indent=2)

    print("\n================ DIAGNOSIS SCORECARD ================")
    print(f"  scenarios:               {report['scenarios']}")
    print(f"  tool-selection accuracy: {report['tool_selection_accuracy']:.0%}")
    print(f"  overall accuracy:        {report['overall_accuracy']:.0%}")
    print(f"  false-action rate:       {report['false_action_rate']:.0%}")
    print(f"  written to:              {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
