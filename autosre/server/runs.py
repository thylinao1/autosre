"""Per-run session management + the pause/resume bridge over InMemoryRunner.

One `IncidentRun` == one incident sweep, keyed by `run_id`. It owns:
  * a dedicated `InMemoryRunner` + session (so runs are isolated),
  * an `asyncio.Queue` of CONTRACT §2 frames consumed by the SSE endpoint,
  * the single pending HITL approval (CONTRACT §3): the driver blocks on an
    `asyncio.Future` until `POST /approval` resolves it, then resumes the same
    session with the rebuilt `adk_request_confirmation` FunctionResponse.

The agent is the only planner. This class is the transport: it reads the
observation stream from `loop.run_turn_resilient`, classifies phases, parses
tool JSON, and stamps each frame with `run_id` + a monotonic `seq`.
"""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from collections import deque
from typing import Any

import httpx
from google.adk.runners import InMemoryRunner

from autosre.agent.agent import root_agent
from autosre.agent import verifier
from autosre.gcp_auth import target_headers

from . import events as E
from . import ledger
from . import loop as L

log = logging.getLogger("autosre")

# Sentinel pushed onto the queue after the terminal frame to close the SSE stream.
STREAM_DONE = object()

_TERMINAL_TYPES = {"final", "error"}

# A pending approval cannot block a run (and the single active-run slot) forever.
# Generous enough for a real operator to deliberate; bounded so an abandoned run
# stands down and frees resources instead of orphaning a coroutine + MCP server.
APPROVAL_TIMEOUT_S = int(os.environ.get("AUTOSRE_APPROVAL_TIMEOUT_S", "300"))


def _target_url() -> str:
    return os.environ.get("TARGET_SERVICE_URL", "http://localhost:8081")


def _default_runner() -> InMemoryRunner:
    """Build the real ADK runner over the AutoSRE agent (the only planner)."""
    return InMemoryRunner(agent=root_agent, app_name=L.APP)


class IncidentRun:
    """A single live incident sweep with its own runner, session, and stream."""

    def __init__(self, run_id: str, prompt: str | None, runner_factory=None) -> None:
        self.run_id = run_id
        self.prompt = prompt
        # runner_factory is a seam for deterministic tests; production uses the
        # real InMemoryRunner over root_agent.
        self._runner = (runner_factory or _default_runner)()
        self._session_id: str | None = None
        self._queue: asyncio.Queue[Any] = asyncio.Queue()
        self._seq = 0
        self._phase = E.PhaseTracker()
        self._task: asyncio.Task | None = None

        # HITL bridge.
        self._pending: dict[str, Any] | None = None
        self._approval: asyncio.Future[bool] | None = None
        self._terminal = False
        # Per-run state used to classify the terminal `outcome` (CONTRACT §2.7) —
        # derived from THIS run, not the target's cumulative remediation log.
        self._declined = False  # operator rejected an approval
        self._acted = False  # set True only when the operator APPROVES the action
        self._auto_approved = False  # set True when policy auto-approved (no human)
        self._risk: dict[str, Any] | None = None  # risk tier of the approved action
        self._problem_found = False  # DETECT surfaced at least one open problem
        # Captured for the approval ledger (audit record on terminal).
        self._incident_title: str | None = None
        self._approved_action: dict[str, Any] | None = None

    # ── frame plumbing ──────────────────────────────────────────────────────
    def _emit(self, frame: dict[str, Any]) -> None:
        frame = {**frame, "run_id": self.run_id, "seq": self._seq}
        self._seq += 1
        self._queue.put_nowait(frame)

    async def stream(self):
        """Async generator of frames for the SSE endpoint; ends after terminal."""
        while True:
            item = await self._queue.get()
            if item is STREAM_DONE:
                return
            yield item

    # ── lifecycle ───────────────────────────────────────────────────────────
    async def start(self) -> None:
        session = await self._runner.session_service.create_session(
            app_name=L.APP, user_id=L.USER
        )
        self._session_id = session.id
        self._task = asyncio.create_task(self._drive())

    @property
    def has_pending_approval(self) -> bool:
        return self._pending is not None and self._approval is not None

    @property
    def is_terminal(self) -> bool:
        return self._terminal

    def abandon(self) -> None:
        """Stand this run down because a newer run superseded it.

        If it is paused at the gate, resolve the decision as reject (a clean
        stand-down → declined terminal); otherwise cancel the driver. This keeps
        at most one active run, so a refresh/restart never orphans a Gemini loop.
        """
        if self.has_pending_approval and self._approval and not self._approval.done():
            self._approval.set_result(False)
        elif self._task is not None and not self._task.done():
            self._task.cancel()

    def dispose(self) -> None:
        """Free resources for an evicted run (cancel its driver task)."""
        if self._task is not None and not self._task.done():
            self._task.cancel()

    def submit_approval(self, confirmation_id: str, approved: bool) -> bool:
        """Resolve a pending approval. Returns False on mismatch/stale id."""
        if not self.has_pending_approval:
            return False
        if self._pending["id"] != confirmation_id:
            return False
        if self._approval.done():
            return False
        self._approval.set_result(approved)
        return True

    # ── the driver: consume observations, emit frames, bridge the pause ──────
    async def _drive(self) -> None:
        try:
            message = L.start_message(self.prompt)
            while True:
                result = L.TurnResult()
                # Buffer this turn's narration; whether it is intermediate
                # (`agent_message`) or the terminal report (`final`) is only known
                # once the turn ends — a turn that pauses for approval narrated
                # intermediate reasoning; the turn with no pending produced the
                # closing report (CONTRACT §2.6/§2.7).
                narration: list[dict[str, Any]] = []
                async for obs in L.run_turn_resilient(
                    self._runner,
                    self._session_id,
                    message,
                    result,
                    # Surface transient free-tier backoff as a live note so the UI
                    # shows the agent waiting rather than appearing frozen.
                    on_backoff=lambda d: self._emit(
                        E.agent_message_frame(
                            f"Model briefly busy (free tier), retrying in {d}s…", True
                        )
                    ),
                ):
                    self._handle_observation(obs, narration)

                if result.pending is None:
                    # Terminal turn: the buffered narration IS the final report.
                    await self._emit_final(result.final_text)
                    return

                # Intermediate turn: flush narration as agent_message, then pause.
                for chunk in narration:
                    self._emit(E.agent_message_frame(chunk["text"], chunk["done"]))

                # Second opinion (opt-in): an independent model critiques the fix
                # before the human decides, surfaced in the timeline / modal.
                if verifier.enabled():
                    critique = await verifier.second_opinion(
                        self._incident_title or "checkout-api incident",
                        self._pending["tool"], self._pending["args"],
                    )
                    if critique:
                        self._emit(E.agent_message_frame(f"Second opinion: {critique}", True))

                # Graduated autonomy: if the operator pre-authorized this action's
                # risk tier, the agent applies it without waiting (still audited).
                # Default is no auto-approve, so normally we block for the human.
                tool, args = self._pending["tool"], self._pending["args"]
                if L.policy.is_auto_approvable(tool, args):
                    tier = self._pending.get("risk", {}).get("tier", "low")
                    self._emit(E.agent_message_frame(
                        f"Auto-approved by policy ({tier} risk): {tool}. "
                        "Recorded in the audit ledger.", True))
                    self._auto_approved = True
                    approved = True
                else:
                    # Pause: block until POST /approval resolves the decision.
                    approved = await self._wait_for_approval()
                if approved:
                    self._risk = self._pending.get("risk")
                    self._approved_action = {
                        "tool": self._pending["tool"],
                        "args": self._pending["args"],
                    }
                    # The operator authorized it, so ADK now executes the tool.
                    # Mark "acted" HERE, on the human decision — never on observing a
                    # remediation tool_result, because ADK emits a confirmation stub
                    # for the gated tool BEFORE this point. Deriving it from the stub
                    # would mislabel a rejection as an approval (the deny-path bug).
                    self._acted = True
                else:
                    self._declined = True
                self._emit(E.approval_resolved_frame(self._pending["id"], approved))
                message = L.confirmation_response(self._pending["id"], approved)
                self._pending = None
                self._approval = None
        except asyncio.CancelledError:  # abandoned/evicted — close quietly
            self._close()
            raise
        except Exception as err:  # noqa: BLE001 - any escape becomes an error frame
            log.exception("run %s driver failed", self.run_id)
            self._emit_error(err)

    def _handle_observation(self, obs: E.Observation, narration: list) -> None:
        if obs.kind == "tool_call":
            step = self._phase.advance_for_tool(obs.payload["name"])
            if step:
                self._emit(E.step_frame(**step))
            self._emit(E.tool_call_frame(obs.payload["name"], obs.payload["args"]))
        elif obs.kind == "tool_result":
            name = obs.payload["name"]
            response = E.parse_tool_response(obs.payload["response"])
            # NB: a remediation tool_result is NOT what marks the run as "acted" —
            # ADK emits a confirmation stub for the gated tool before the operator
            # decides, so `_acted` is set on approval (see _drive), not here.
            problems = response.get("problems") or []
            if problems:
                self._problem_found = True
                if self._incident_title is None:
                    self._incident_title = problems[0].get("title")
            summary = E.summarize_tool_result(name, response)
            self._emit(E.tool_result_frame(name, response, summary))
        elif obs.kind == "approval_request":
            self._problem_found = True
            step = self._phase.advance_for_approval()
            if step:
                self._emit(E.step_frame(**step))
            self._pending = obs.payload
            self._emit(E.approval_request_frame(obs.payload))
        elif obs.kind == "agent_message":
            narration.append(obs.payload)

    async def _wait_for_approval(self) -> bool:
        loop = asyncio.get_running_loop()
        self._approval = loop.create_future()
        try:
            return await asyncio.wait_for(self._approval, timeout=APPROVAL_TIMEOUT_S)
        except asyncio.TimeoutError:
            log.warning(
                "run %s approval timed out after %ss; standing down",
                self.run_id,
                APPROVAL_TIMEOUT_S,
            )
            return False

    # ── terminal frames ──────────────────────────────────────────────────────
    async def _emit_final(self, report: str) -> None:
        state = await self._read_state()
        service_healthy = bool(state.get("healthy", False))
        injected = state.get("injected_fault")

        # outcome is classified from THIS run's activity (CONTRACT §2.7):
        #   all_clear  — DETECT found no problem and we took no action.
        #   resolved   — we acted (operator-approved) and the fault is now cleared.
        #   declined   — operator rejected the remediation; nothing ran.
        #   unresolved — an action ran but the fault is still present.
        # incident_resolved: a problem existed and is cleared by our action.
        incident_resolved = (
            self._problem_found and self._acted and injected is None and service_healthy
        )
        if not self._problem_found and not self._acted and not self._declined and injected is None:
            # Only truly all-clear when DETECT found nothing AND no fault is live. If
            # detection came up empty while a fault is genuinely injected (a detection
            # gap), fall through to "unresolved" rather than falsely report all-clear.
            outcome = "all_clear"
        elif incident_resolved:
            outcome = "resolved"
        elif self._declined and not self._acted:
            outcome = "declined"
        else:
            outcome = "unresolved"

        # Audit ledger: one immutable record per sweep, then a best-effort
        # write-back to Dynatrace (no-op unless OTLP creds are configured).
        entry = ledger.record(
            {
                "run_id": self.run_id,
                "incident": self._incident_title
                or ("checkout-api incident" if self._problem_found else None),
                "action": self._approved_action,
                "decision": "approved"
                if self._approved_action is not None
                else ("rejected" if self._declined else "none"),
                "outcome": outcome,
                "service_healthy": service_healthy,
                "incident_resolved": incident_resolved,
                "auto_approved": self._auto_approved,
                "risk": self._risk,
            }
        )
        if ledger.export_enabled():
            asyncio.create_task(ledger.export_async(entry))

        self._emit(
            E.final_frame(
                report=report or "Incident sweep complete.",
                service_healthy=service_healthy,
                incident_resolved=incident_resolved,
                outcome=outcome,
            )
        )
        self._close()

    def _emit_error(self, err: Exception) -> None:
        retriable = L.is_rate_limit(err)
        msg = (
            "Model rate-limited and retries exhausted (RESOURCE_EXHAUSTED)."
            if retriable
            else "The incident sweep failed unexpectedly."
        )
        self._emit(E.error_frame(msg, retriable))
        self._close()

    def _close(self) -> None:
        self._terminal = True
        self._queue.put_nowait(STREAM_DONE)

    async def _read_state(self) -> dict[str, Any]:
        try:
            base = _target_url()
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{base}/_internal/state", headers=target_headers(base)
                )
                return resp.json()
        except Exception:  # noqa: BLE001 - missing target shouldn't crash the run
            log.warning("run %s could not read target state", self.run_id)
            return {}


# How many recent runs to retain before evicting the oldest (bounded so a long
# judging session can't grow the registry without limit, mirroring the ledger).
_MAX_RUNS = int(os.environ.get("AUTOSRE_MAX_RUNS", "50"))


class RunRegistry:
    """In-process map of run_id -> IncidentRun, bounded and single-active.

    Single-active is the token-burn guard: starting a run stands down any prior
    non-terminal run, so at most one Gemini loop is ever live on the instance.
    Combined with the endpoint rate limit + --max-instances=1, this caps abuse of
    the public, unauthenticated demo without breaking a legitimate re-run/refresh.
    """

    def __init__(self, max_runs: int = _MAX_RUNS) -> None:
        self._runs: dict[str, IncidentRun] = {}
        self._order: deque[str] = deque()
        self._max_runs = max_runs

    def _active(self) -> IncidentRun | None:
        # Active == not terminal AND its driver task is still alive. A run whose
        # task finished/cancelled (or whose event loop closed) is not active even
        # if it never stamped a terminal frame, so the guard can't wedge on a
        # dead run.
        for run in self._runs.values():
            if run.is_terminal:
                continue
            task = run._task
            if task is not None and not task.done():
                return run
        return None

    async def create(self, prompt: str | None, runner_factory=None) -> IncidentRun:
        # Stand down any prior in-flight run so only one is ever active.
        active = self._active()
        if active is not None:
            log.info("superseding active run %s with a new run", active.run_id)
            active.abandon()

        # Evict oldest terminal runs beyond the cap (free their resources).
        while len(self._runs) >= self._max_runs and self._order:
            old_id = self._order.popleft()
            old = self._runs.pop(old_id, None)
            if old is not None:
                old.dispose()

        run_id = str(uuid.uuid4())
        run = IncidentRun(run_id, prompt, runner_factory=runner_factory)
        self._runs[run_id] = run
        self._order.append(run_id)
        await run.start()
        return run

    def get(self, run_id: str) -> IncidentRun | None:
        return self._runs.get(run_id)

    def has_active_run(self) -> bool:
        return self._active() is not None
