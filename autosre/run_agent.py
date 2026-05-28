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
import re

from dotenv import load_dotenv

# Load .env BEFORE importing the agent: the agent reads AUTOSRE_MODEL and the
# Dynatrace mode at import time, so the environment must be populated first.
load_dotenv()

from google.adk.runners import InMemoryRunner  # noqa: E402
from google.genai import types  # noqa: E402

from autosre.agent.agent import root_agent  # noqa: E402
from autosre.agent.remediation import APPROVAL_GATE  # noqa: E402

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


def _retry_delay(err: Exception) -> int:
    """Pull the server-suggested retry delay (seconds) out of a 429 error."""
    m = re.search(r"retry in ([\d.]+)s", str(err)) or \
        re.search(r"retryDelay'?: ?'?(\d+)", str(err))
    return int(float(m.group(1))) + 2 if m else 20


async def _run_turn_resilient(runner: InMemoryRunner, session_id: str, text: str,
                              max_retries: int = 6) -> str:
    """Run a turn, transparently backing off and resuming on free-tier 429s."""
    message = text
    for attempt in range(max_retries + 1):
        try:
            return await _run_turn(runner, session_id, message)
        except Exception as err:  # noqa: BLE001
            if "RESOURCE_EXHAUSTED" not in str(err) and "429" not in str(err):
                raise
            if attempt == max_retries:
                raise
            delay = _retry_delay(err)
            print(f"   [rate-limited by free tier; waiting {delay}s then resuming…]")
            await asyncio.sleep(delay)
            message = "Continue from where you left off."
    return ""


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
        answer = await _run_turn_resilient(runner, session.id, message)
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
