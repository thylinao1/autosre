"""Interactive runner for the AutoSRE agent — the primary demo entry point.

It drives the detect -> diagnose -> propose -> APPROVE -> act -> verify loop and
enforces human-in-the-loop approval: when the agent proposes a remediation, the
runner pauses and asks YOU. Only a real "yes" flips the approval gate, after which
the agent is allowed to execute the action it proposed.

Usage:
    python -m autosre.run_agent
    python -m autosre.run_agent --auto-approve   # skip the prompt (CI/e2e)
"""

from __future__ import annotations

import argparse
import asyncio

from dotenv import load_dotenv
from google.adk.runners import InMemoryRunner
from google.genai import types

from autosre.agent.agent import root_agent
from autosre.agent.remediation import APPROVAL_GATE

APP = "autosre"
USER = "operator"


async def _run_turn(runner: InMemoryRunner, session_id: str, text: str) -> str:
    """Send one message, stream tool activity, return the agent's final text."""
    msg = types.Content(role="user", parts=[types.Part(text=text)])
    final = ""
    async for event in runner.run_async(user_id=USER, session_id=session_id,
                                        new_message=msg):
        for part in (event.content.parts if event.content else []):
            if getattr(part, "function_call", None):
                fc = part.function_call
                print(f"   → tool: {fc.name}({dict(fc.args)})")
            elif getattr(part, "function_response", None):
                resp = part.function_response.response
                print(f"   ← result: {resp}")
        if event.is_final_response() and event.content:
            final = "".join(p.text or "" for p in event.content.parts)
    return final


async def main(auto_approve: bool) -> None:
    load_dotenv()
    runner = InMemoryRunner(agent=root_agent, app_name=APP)
    session = await runner.session_service.create_session(app_name=APP, user_id=USER)

    print("=" * 70)
    print("AutoSRE — autonomous incident response (human-in-the-loop)")
    print("=" * 70)

    message = ("Run an incident sweep on checkout-api. Detect open problems, "
               "diagnose the root cause with evidence, and if something is wrong, "
               "propose exactly one remediation for my approval.")

    while True:
        print("\n--- agent turn ---")
        answer = await _run_turn(runner, session.id, message)
        if answer:
            print(f"\nAutoSRE: {answer}")

        plan = APPROVAL_GATE.get("plan")
        if not plan:
            break  # nothing pending -> all clear or already resolved

        print("\n" + "!" * 70)
        print("HUMAN APPROVAL REQUIRED")
        print(f"  incident : {plan['summary']}")
        print(f"  action   : {plan['action']}({plan['args']})")
        print(f"  rationale: {plan['rationale']}")
        print("!" * 70)

        approved = auto_approve or input("Approve this remediation? [y/N] ").strip().lower().startswith("y")
        APPROVAL_GATE["plan"] = None  # consume the proposal
        if approved:
            if auto_approve:
                print("Approve this remediation? [y/N] y  (auto)")
            APPROVAL_GATE["approved"] = True
            message = "Approved. Execute the remediation you proposed, then verify recovery."
        else:
            APPROVAL_GATE["approved"] = False
            message = "The operator rejected the remediation. Stand down and take no action."

    print("\nDone.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--auto-approve", action="store_true",
                    help="auto-approve the proposed remediation (for CI/e2e)")
    asyncio.run(main(ap.parse_args().auto_approve))
