"""Interactive runner for the AutoSRE agent — the primary CLI demo entry point.

It drives the detect -> diagnose -> ACT -> verify loop. When the agent calls a
remediation tool, ADK pauses for human-in-the-loop confirmation (the tools are
declared with require_confirmation=True). This runner surfaces that pause, asks
YOU to approve, and sends the confirmation back so the action can execute.

The actual ADK loop primitives live in `autosre.server.loop` so the CLI and the
HTTP/SSE server share one implementation. This module is the thin terminal UI.

Usage:
    python -m autosre.run_agent
    python -m autosre.run_agent --auto-approve   # approve automatically (CI/e2e)
"""

from __future__ import annotations

import argparse
import asyncio

from dotenv import load_dotenv

# Load .env BEFORE importing the agent: the agent reads AUTOSRE_MODEL and the
# Dynatrace mode at import time, so the environment must be populated first.
load_dotenv()

from google.adk.runners import InMemoryRunner  # noqa: E402

from autosre.agent.agent import root_agent  # noqa: E402
from autosre.server import loop as L  # noqa: E402

APP = L.APP
USER = L.USER


async def _run_turn(runner: InMemoryRunner, session_id, message):
    """Send one message; print activity. Return (final_text, pending)."""
    result = L.TurnResult()
    async for obs in L.run_turn_resilient(
        runner,
        session_id,
        message,
        result,
        on_backoff=lambda d: print(
            f"   [rate-limited by free tier; waiting {d}s then resuming…]"
        ),
    ):
        if obs.kind == "tool_call":
            print(f"   → tool: {obs.payload['name']}({obs.payload['args']})")
        elif obs.kind == "tool_result":
            print(f"   ← result: {obs.payload['response']}")
    return result.final_text, result.pending


async def main(auto_approve: bool) -> None:
    runner = InMemoryRunner(agent=root_agent, app_name=APP)
    session = await runner.session_service.create_session(app_name=APP, user_id=USER)

    print("=" * 70)
    print("AutoSRE — autonomous incident response (human-in-the-loop)")
    print("=" * 70)

    message = L.start_message()

    while True:
        print("\n--- agent turn ---")
        answer, pending = await _run_turn(runner, session.id, message)
        if answer:
            print(f"\nAutoSRE: {answer}")

        if not pending:
            break  # nothing awaiting approval -> all clear or resolved

        print("\n" + "!" * 70)
        print("HUMAN APPROVAL REQUIRED")
        print(f"  remediation: {pending['tool']}({pending['args']})")
        if pending["hint"]:
            print(f"  note       : {pending['hint']}")
        print("!" * 70)

        if auto_approve:
            print("Approve this remediation? [y/N] y  (auto)")
            approved = True
        else:
            approved = (
                input("Approve this remediation? [y/N] ")
                .strip()
                .lower()
                .startswith("y")
            )

        message = L.confirmation_response(pending["id"], approved)
        if not approved:
            print("Rejected — instructing the agent to stand down.")

    print("\nDone.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--auto-approve",
        action="store_true",
        help="approve the proposed remediation automatically (CI/e2e)",
    )
    asyncio.run(main(ap.parse_args().auto_approve))
