"""Shared agent-loop primitives, factored out of the CLI runner.

Both the interactive CLI (`autosre.run_agent`) and the HTTP/SSE server
(`autosre.server.app`) drive the *same* ADK `InMemoryRunner` loop. This module
owns that single source of truth so the wire behaviour is identical:

  * `run_turn_observed` — runs one runner turn and yields a stream of typed
    *observations* (`tool_call` / `tool_result` / `approval_request` /
    `agent_message`), exactly mirroring the inspection in the reference
    `run_agent._run_turn`. It returns the terminal `(final_text, pending)`.
  * `run_turn_resilient` — wraps a turn with the free-tier 429/RESOURCE_EXHAUSTED
    backoff (identical policy to the CLI).
  * `confirmation_response` — rebuilds the ADK HITL resume `Content` byte-for-byte
    as the contract (§3) requires.

The agent stays the only planner; this module is pure transport plumbing.
"""

from __future__ import annotations

import asyncio
import re
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

from google.adk.runners import InMemoryRunner
from google.genai import types

APP = "autosre"
USER = "operator"
CONFIRM = "adk_request_confirmation"

# The default sweep prompt — kept identical to run_agent.py:104 so the CLI and
# the HTTP `start` endpoint kick off the agent with the same instruction.
DEFAULT_PROMPT = (
    "Run an incident sweep on checkout-api. Detect open problems, diagnose the "
    "root cause with evidence, and remediate the issue."
)

# Retry policy for free-tier rate limits. Tuned so a brief free-tier capacity
# spike (gemini-3-flash-preview 503/UNAVAILABLE) is ridden out rather than
# aborting the sweep: 10 transient retries x 5s ~= 50s of patience, which covers
# the typical "high demand" blip without any paid tier or model swap.
DEFAULT_MAX_RETRIES = 10
DEFAULT_RETRY_DELAY_S = 20
TRANSIENT_RETRY_DELAY_S = 5  # short backoff for 503/UNAVAILABLE (not a quota cap)


@dataclass
class TurnResult:
    """Out-param for an observed turn: the terminal text and any pending HITL.

    `pending`, if set, is {id, tool, args, hint} for a remediation the agent
    wants to run that is now awaiting human approval (mirrors run_agent.py).
    """

    final_text: str = ""
    pending: dict[str, Any] | None = None
    # Number of text chunks seen this turn (lets the driver classify narration).
    text_chunks: int = 0


@dataclass
class Observation:
    """A single thing the agent did during a turn, in stream order."""

    kind: str  # "tool_call" | "tool_result" | "approval_request" | "agent_message"
    payload: dict[str, Any] = field(default_factory=dict)


def _operator_hint(tool: str, args: dict[str, Any], raw_hint: str) -> str:
    """A short, operator-facing description of the proposed action.

    On the live model path ADK populates `toolConfirmation.hint` with its internal
    protocol text ("respond with a FunctionResponse with an expected
    ToolConfirmation payload"), which is meaningless to a human deciding whether to
    approve. Synthesize a clear hint for the remediation tools we own so the hero
    approval modal reads like an operator note, not framework plumbing.
    """
    if tool == "toggle_feature_flag":
        flag = args.get("name", "the feature flag")
        verb = "Disable" if args.get("enabled") is False else "Enable"
        return f"{verb} the '{flag}' feature flag on checkout-api to clear the incident."
    if tool == "scale_service":
        return f"Scale checkout-api to {args.get('replicas', 'more')} replicas to relieve the saturation."
    if tool == "rollback_deployment":
        return f"Roll checkout-api back to version {args.get('version', 'the last good deploy')}."
    # Unknown tool: keep a human-written hint, but never the ADK protocol boilerplate.
    if raw_hint and "FunctionResponse" not in raw_hint and "ToolConfirmation" not in raw_hint:
        return raw_hint
    return "Review and approve this remediation before it runs on checkout-api."


def _extract_pending(fc: Any) -> dict[str, Any]:
    """Lift the wrapped remediation call out of an adk_request_confirmation fc.

    Identical to run_agent.py:50-55 — the join key `id` is the ADK fc id. The hint
    is normalized to an operator-facing string (see `_operator_hint`).
    """
    args = fc.args or {}
    orig = args.get("originalFunctionCall", {}) or {}
    tool = orig.get("name", "unknown")
    tool_args = orig.get("args", {}) or {}
    raw_hint = (args.get("toolConfirmation", {}) or {}).get("hint", "")
    return {
        "id": fc.id,
        "tool": tool,
        "args": tool_args,
        "hint": _operator_hint(tool, tool_args, raw_hint),
    }


async def run_turn_observed(
    runner: InMemoryRunner,
    session_id: str,
    message: types.Content,
    result: TurnResult,
) -> AsyncIterator[Observation]:
    """Run one runner turn; yield observations; record terminal state in `result`.

    Mirrors run_agent._run_turn: inspects each event's parts for a
    function_call (`fc`) / function_response (`fr`), separates the HITL
    confirmation request from ordinary tool traffic, and surfaces text.

    Every text part is yielded as an `agent_message` observation so the UI sees
    reasoning as it streams, AND accumulated into `result.final_text`. The driver
    decides which is which by turn boundary: a turn that ends with a pending
    confirmation produced *intermediate* narration; the turn with no pending
    produced the *terminal* report (CONTRACT §2.6/§2.7). `result.text_chunks`
    lets the driver suppress the duplicate `agent_message` on the terminal turn.
    """
    async for event in runner.run_async(
        user_id=USER, session_id=session_id, new_message=message
    ):
        parts = event.content.parts if event.content else []
        for part in parts:
            fc = getattr(part, "function_call", None)
            fr = getattr(part, "function_response", None)
            text = getattr(part, "text", None)

            if fc and fc.name == CONFIRM:
                pending = _extract_pending(fc)
                result.pending = pending
                yield Observation("approval_request", pending)
            elif fc:
                yield Observation(
                    "tool_call",
                    {"name": fc.name, "args": dict(fc.args or {})},
                )
            elif fr and fr.name != CONFIRM:
                yield Observation(
                    "tool_result",
                    {"name": fr.name, "response": fr.response},
                )
            elif text:
                result.final_text += text
                result.text_chunks += 1
                yield Observation(
                    "agent_message",
                    {"text": text, "done": bool(not event.partial)},
                )


def retry_delay(err: Exception) -> int:
    """Parse a server-suggested retry delay, defaulting to a safe pause."""
    m = re.search(r"retry in ([\d.]+)s", str(err)) or re.search(
        r"retryDelay'?: ?'?(\d+)", str(err)
    )
    return int(float(m.group(1))) + 2 if m else DEFAULT_RETRY_DELAY_S


def is_rate_limit(err: Exception) -> bool:
    """True for free-tier 429 / RESOURCE_EXHAUSTED — drives the `error.retriable` hint."""
    s = str(err)
    return "RESOURCE_EXHAUSTED" in s or "429" in s


def is_transient(err: Exception) -> bool:
    """Retryable upstream blips: rate limits *and* transient outages.

    Extends the reference 429 policy to also resume on 503 / UNAVAILABLE /
    overloaded so a brief model spike doesn't abort a live demo. This governs
    only whether we back off + resume — it never bypasses the approval gate or
    alters the agent's plan.
    """
    s = str(err)
    return is_rate_limit(err) or "503" in s or "UNAVAILABLE" in s or "overloaded" in s.lower()


async def run_turn_resilient(
    runner: InMemoryRunner,
    session_id: str,
    message: types.Content,
    result: TurnResult,
    *,
    max_retries: int = DEFAULT_MAX_RETRIES,
    on_backoff=None,
) -> AsyncIterator[Observation]:
    """Run a turn, backing off + resuming on transient upstream errors.

    Extends run_agent._run_turn_resilient: RESOURCE_EXHAUSTED / 429 use the
    server-suggested retry delay; 503 / UNAVAILABLE / overloaded use a short
    fixed backoff. Everything else (and exhausted retries) re-raises so the
    caller can surface it as an `error` event. `on_backoff(delay)` is an optional
    callback so the server can log the wait without leaking tokens.
    """
    attempt = 0
    msg = message
    while True:
        try:
            async for obs in run_turn_observed(runner, session_id, msg, result):
                yield obs
            return
        except Exception as err:  # noqa: BLE001 - re-raised unless retryable
            if not is_transient(err) or attempt >= max_retries:
                raise
            attempt += 1
            delay = retry_delay(err) if is_rate_limit(err) else TRANSIENT_RETRY_DELAY_S
            if on_backoff is not None:
                on_backoff(delay)
            await asyncio.sleep(delay)
            msg = types.Content(role="user", parts=[types.Part(text="Continue.")])


def confirmation_response(confirm_id: str, approved: bool) -> types.Content:
    """Rebuild the HITL resume message exactly as run_agent.py:89-92."""
    return types.Content(
        role="user",
        parts=[
            types.Part(
                function_response=types.FunctionResponse(
                    id=confirm_id,
                    name=CONFIRM,
                    response={"confirmed": approved},
                )
            )
        ],
    )


def start_message(prompt: str | None = None) -> types.Content:
    """The opening user message that kicks off a sweep."""
    return types.Content(
        role="user", parts=[types.Part(text=prompt or DEFAULT_PROMPT)]
    )
