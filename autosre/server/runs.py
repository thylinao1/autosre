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
import os
import uuid
from typing import Any

import httpx
from google.adk.runners import InMemoryRunner

from autosre.agent.agent import root_agent

from . import events as E
from . import ledger
from . import loop as L

# Sentinel pushed onto the queue after the terminal frame to close the SSE stream.
STREAM_DONE = object()

_TERMINAL_TYPES = {"final", "error"}


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

                # Pause: block until POST /approval resolves the decision.
                approved = await self._wait_for_approval()
                if approved:
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
        except Exception as err:  # noqa: BLE001 - any escape becomes an error frame
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
        return await self._approval

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
        if not self._problem_found and not self._acted and not self._declined:
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
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"{_target_url()}/_internal/state")
                return resp.json()
        except Exception:  # noqa: BLE001 - missing target shouldn't crash the run
            return {}


class RunRegistry:
    """In-process map of run_id -> IncidentRun."""

    def __init__(self) -> None:
        self._runs: dict[str, IncidentRun] = {}

    async def create(self, prompt: str | None, runner_factory=None) -> IncidentRun:
        run_id = str(uuid.uuid4())
        run = IncidentRun(run_id, prompt, runner_factory=runner_factory)
        self._runs[run_id] = run
        await run.start()
        return run

    def get(self, run_id: str) -> IncidentRun | None:
        return self._runs.get(run_id)
