"""Interactive runner for the AutoSRE agent — the primary CLI demo entry point.

It drives the detect -> diagnose -> ACT -> verify loop. When the agent calls a
remediation tool, ADK pauses for human-in-the-loop confirmation (the tools are
declared with require_confirmation=True). This runner surfaces that pause, asks
YOU to approve, and sends the confirmation back so the action can execute.

Usage:
    python -m autosre.run_agent
    python -m autosre.run_agent --auto-approve   # approve automatically (CI/e2e)
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

APP = "autosre"
USER = "operator"
CONFIRM = "adk_request_confirmation"


async def _run_turn(runner: InMemoryRunner, session_id: str,
                    message: types.Content) -> tuple[str, dict | None]:
    """Send one message; stream activity. Return (final_text, pending_confirmation).

    pending_confirmation, if set, is {id, tool, args, hint} for a remediation the
    agent wants to run that is now waiting for human approval.
    """
    final = ""
    pending: dict | None = None
    async for event in runner.run_async(user_id=USER, session_id=session_id,
                                        new_message=message):
        for part in (event.content.parts if event.content else []):
            fc = getattr(part, "function_call", None)
            fr = getattr(part, "function_response", None)
            if fc and fc.name == CONFIRM:
                orig = (fc.args or {}).get("originalFunctionCall", {})
                pending = {
                    "id": fc.id,
                    "tool": orig.get("name", "unknown"),
                    "args": orig.get("args", {}),
                    "hint": (fc.args or {}).get("toolConfirmation", {}).get("hint", ""),
                }
            elif fc:
                print(f"   → tool: {fc.name}({dict(fc.args)})")
            elif fr and fr.name != CONFIRM:
                print(f"   ← result: {fr.response}")
        if event.is_final_response() and event.content:
            final = "".join(p.text or "" for p in event.content.parts)
    return final, pending


def _retry_delay(err: Exception) -> int:
    m = re.search(r"retry in ([\d.]+)s", str(err)) or \
        re.search(r"retryDelay'?: ?'?(\d+)", str(err))
    return int(float(m.group(1))) + 2 if m else 20


async def _run_turn_resilient(runner, session_id, message, max_retries=6):
    """Run a turn, backing off and resuming on free-tier 429 rate limits."""
    for attempt in range(max_retries + 1):
        try:
            return await _run_turn(runner, session_id, message)
        except Exception as err:  # noqa: BLE001
            if ("RESOURCE_EXHAUSTED" not in str(err) and "429" not in str(err)) \
                    or attempt == max_retries:
                raise
            delay = _retry_delay(err)
            print(f"   [rate-limited by free tier; waiting {delay}s then resuming…]")
            await asyncio.sleep(delay)
            message = types.Content(role="user",
                                    parts=[types.Part(text="Continue.")])
    return "", None


def _confirmation_response(confirm_id: str, approved: bool) -> types.Content:
    return types.Content(role="user", parts=[types.Part(
        function_response=types.FunctionResponse(
            id=confirm_id, name=CONFIRM, response={"confirmed": approved}))])


async def main(auto_approve: bool) -> None:
    runner = InMemoryRunner(agent=root_agent, app_name=APP)
    session = await runner.session_service.create_session(app_name=APP, user_id=USER)

    print("=" * 70)
    print("AutoSRE — autonomous incident response (human-in-the-loop)")
    print("=" * 70)

    message = types.Content(role="user", parts=[types.Part(text=(
        "Run an incident sweep on checkout-api. Detect open problems, diagnose the "
        "root cause with evidence, and remediate the issue."))])

    while True:
        print("\n--- agent turn ---")
        answer, pending = await _run_turn_resilient(runner, session.id, message)
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
            approved = input("Approve this remediation? [y/N] ").strip().lower().startswith("y")

        message = _confirmation_response(pending["id"], approved)
        if not approved:
            print("Rejected — instructing the agent to stand down.")

    print("\nDone.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--auto-approve", action="store_true",
                    help="approve the proposed remediation automatically (CI/e2e)")
    asyncio.run(main(ap.parse_args().auto_approve))
