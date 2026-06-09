"use client";

import { useCallback, useRef, useState } from "react";
import { startRun, streamUrl, submitApproval, resetFaults, getHealth } from "@/lib/api";
import type {
  IncidentState,
  SSEEvent,
  StepEvent,
  ToolResultEvent,
  ApprovalRequestEvent,
  ApprovalResolvedEvent,
  FinalEvent,
  AgentMessageEvent,
  DynatraceProblem,
  DqlRecord,
  FaultType,
  RunStatus,
  TimelineEntry,
  Phase,
} from "@/lib/types";

const INITIAL_STATE: IncidentState = {
  runId: null,
  status: "idle",
  problem: null,
  currentPhase: null,
  timeline: [],
  dqlQuery: null,
  dqlRecords: [],
  agentReasoning: "",
  pendingApproval: null,
  finalEvent: null,
  errorMessage: null,
  serviceHealth: null,
  startedAt: null,
  endedAt: null,
  proposedAt: null,
};

function makeEntry(event: SSEEvent, label: string, detail?: string): TimelineEntry {
  return {
    id: `${event.seq}-${event.type}`,
    seq: event.seq,
    kind: event.type as TimelineEntry["kind"],
    label,
    detail,
    timestamp: Date.now(),
    raw: event,
    phase: "phase" in event ? (event as StepEvent).phase : undefined,
  };
}

const TERMINAL_STATUSES: RunStatus[] = ["resolved", "declined", "all_clear", "error"];

// The gated remediation tools. The ADK confirmation stub can emit a `tool_result`
// for one of these BEFORE the human decides, which would otherwise render a
// misleading "returned" line while the approval modal is still open.
const GATED_TOOLS = new Set(["scale_service", "rollback_deployment", "toggle_feature_flag"]);

// Cap on agentReasoning length: a long run can stream many tokens; keep only the
// tail so the buffer (and the panel it feeds) can't grow unbounded.
const MAX_REASONING_CHARS = 4000;

function processEvent(prev: IncidentState, event: SSEEvent): IncidentState {
  // Once a run has reached a terminal status, ignore any trailing or out-of-order
  // frames. Without this, a late `step`/`tool_*` frame arriving after an optimistic
  // synthesized terminal would flip the run back to "running" (a visible
  // Resolved → Running → Resolved flicker on the happy path).
  if (TERMINAL_STATUSES.includes(prev.status)) return prev;

  const addEntry = (label: string, detail?: string): TimelineEntry[] => [
    ...prev.timeline,
    makeEntry(event, label, detail),
  ];

  switch (event.type) {
    case "step": {
      const e = event as StepEvent;
      return {
        ...prev,
        currentPhase: e.phase as Phase,
        status: "running",
        timeline: addEntry(`Phase: ${e.phase.toUpperCase()}`, e.status),
      };
    }

    case "tool_call": {
      const tc = event as { type: "tool_call"; run_id: string; seq: number; name: string; args: Record<string, unknown> };
      const argStr = Object.entries(tc.args)
        .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
        .join(" ");
      return {
        ...prev,
        timeline: addEntry(`${tc.name}(${argStr})`, undefined),
        // Capture the DQL string on execute_dql. The mock arg is dqlQueryString;
        // the real @dynatrace-oss MCP arg is dqlStatement. Tool names are
        // snake_case (mock + real v1.8.6); kebab kept for any older gateway.
        dqlQuery:
          tc.name === "execute_dql" || tc.name === "execute-dql"
            ? ((tc.args.dqlStatement as string) ||
               (tc.args.dqlQueryString as string) ||
               prev.dqlQuery)
            : prev.dqlQuery,
      };
    }

    case "tool_result": {
      const tr = event as ToolResultEvent;
      let nextState = { ...prev };

      // Extract the problem from the detection tool. Tool names are snake_case
      // (mock: query_problems; real v1.8.6: list_problems); kebab kept for safety.
      if (
        tr.name === "query_problems" ||
        tr.name === "list_problems" ||
        tr.name === "query-problems"
      ) {
        const problems = (tr.response?.problems as DynatraceProblem[]) ?? [];
        if (problems.length > 0) {
          nextState.problem = problems[0];
        }
      }

      // Extract DQL records from execute_dql result (snake + kebab).
      if (
        (tr.name === "execute_dql" || tr.name === "execute-dql") &&
        tr.response?.records
      ) {
        nextState.dqlRecords = tr.response.records as DqlRecord[];
      }

      // Deny-path label fix: the ADK confirmation stub emits a `tool_result` for a
      // gated remediation tool BEFORE the human decides. Rendering "returned" then
      // would falsely imply the action ran while the modal is still open. While the
      // run is awaiting approval (or an approval is pending), relabel that frame so
      // it reads as proposed-not-executed. The real post-approval result still
      // renders normally (this branch only fires in the awaiting-approval window).
      const awaitingApproval =
        prev.status === "awaiting_approval" || prev.pendingApproval !== null;
      if (GATED_TOOLS.has(tr.name) && awaitingApproval) {
        return {
          ...nextState,
          timeline: addEntry("Proposed, awaiting approval - not yet executed", undefined),
        };
      }

      return {
        ...nextState,
        timeline: addEntry(`result: ${tr.summary}`, undefined),
      };
    }

    case "agent_message": {
      const am = event as AgentMessageEvent;
      const merged = am.done ? am.text : prev.agentReasoning + am.text;
      // Keep only the tail so a long run can't grow the buffer unbounded.
      const bounded =
        merged.length > MAX_REASONING_CHARS ? merged.slice(-MAX_REASONING_CHARS) : merged;
      return {
        ...prev,
        agentReasoning: bounded,
        timeline: addEntry("Agent reasoning…", am.text.slice(0, 80) + (am.text.length > 80 ? "…" : "")),
      };
    }

    case "approval_request": {
      const ar = event as ApprovalRequestEvent;
      // `pendingApproval` stores the whole event, so the risk tier rides along for
      // the modal. Stamp `proposedAt` now: this is the moment the agent reached a
      // proposed fix, which lets the header split model time from total time.
      return {
        ...prev,
        pendingApproval: ar,
        status: "awaiting_approval",
        proposedAt: prev.proposedAt ?? Date.now(),
        timeline: addEntry(
          `Approval required: ${ar.tool}`,
          ar.hint || Object.entries(ar.args).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" ")
        ),
      };
    }

    case "approval_resolved": {
      const resolved = event as { type: "approval_resolved"; run_id: string; seq: number; id: string; approved: boolean };
      return {
        ...prev,
        pendingApproval: null,
        status: "running",
        timeline: addEntry(
          resolved.approved ? "Approved, executing remediation" : "Rejected, standing down",
          undefined
        ),
      };
    }

    case "final": {
      const f = event as FinalEvent;
      const status: RunStatus =
        f.outcome === "resolved"
          ? "resolved"
          : f.outcome === "all_clear"
          ? "all_clear"
          : f.outcome === "declined"
          ? "declined"
          : "error";

      const finalLabel =
        f.outcome === "resolved"
          ? "Service restored, incident resolved"
          : f.outcome === "declined"
          ? "Agent stood down - nothing changed"
          : f.outcome === "all_clear"
          ? "All clear - no action needed"
          : "Run complete";
      return {
        ...prev,
        finalEvent: f,
        status,
        endedAt: prev.endedAt ?? Date.now(),
        timeline: addEntry(
          finalLabel,
          f.report.slice(0, 100) + (f.report.length > 100 ? "…" : "")
        ),
      };
    }

    case "error": {
      const err = event as { type: "error"; run_id: string; seq: number; message: string; retriable: boolean };
      return {
        ...prev,
        status: "error",
        errorMessage: err.message,
        endedAt: prev.endedAt ?? Date.now(),
        timeline: addEntry(`Error: ${err.message}`, undefined),
      };
    }

    default:
      return prev;
  }
}

export interface UseIncidentStreamReturn {
  state: IncidentState;
  startIncident: (inject: FaultType | null) => Promise<void>;
  approve: (approved: boolean) => Promise<void>;
  reset: () => Promise<void>;
}

export function useIncidentStream(): UseIncidentStreamReturn {
  const [state, setState] = useState<IncidentState>(INITIAL_STATE);
  const esRef = useRef<EventSource | null>(null);
  const stateRef = useRef<IncidentState>(INITIAL_STATE);

  // Keep ref in sync so event handlers always read fresh state
  const updateState = useCallback((updater: (prev: IncidentState) => IncidentState) => {
    setState((prev) => {
      const next = updater(prev);
      stateRef.current = next;
      return next;
    });
  }, []);

  const startIncident = useCallback(
    async (inject: FaultType | null) => {
      // Close any open stream
      esRef.current?.close();

      // Stamp the start now (the click) so the on-screen timer reflects the real
      // wall clock the operator waited, from "go" to a verified resolution.
      updateState(() => ({ ...INITIAL_STATE, status: "starting", startedAt: Date.now() }));

      let runId: string;
      try {
        const res = await startRun(inject);
        runId = res.run_id;
      } catch (err) {
        updateState((prev) => ({
          ...prev,
          status: "error",
          errorMessage: err instanceof Error ? err.message : "Failed to start run",
        }));
        return;
      }

      updateState((prev) => ({ ...prev, runId, status: "running" }));

      // Append inject param so mock stream knows which scenario
      const url =
        streamUrl(runId) +
        (inject ? `?inject=${encodeURIComponent(inject)}` : "");

      const es = new EventSource(url);
      esRef.current = es;

      const HANDLED_TYPES = [
        "step",
        "tool_call",
        "tool_result",
        "agent_message",
        "approval_request",
        "approval_resolved",
        "final",
        "error",
      ] as const;

      for (const eventType of HANDLED_TYPES) {
        es.addEventListener(eventType, (evt: MessageEvent) => {
          try {
            const parsed = JSON.parse(evt.data as string) as SSEEvent;
            updateState((prev) => processEvent(prev, parsed));
          } catch {
            // malformed frame - ignore
          }
        });
      }

      es.onerror = () => {
        // A close after a terminal frame is normal. A close mid-run is not fatal
        // either: on Cloud Run the SSE stream can drop during the human-approval
        // pause while the backend keeps working, and the approve/reject paths
        // reconcile via the health poll. So if we drop while still pre-approval and
        // non-terminal (starting/running), surface a soft "reconnecting…" hint
        // rather than flipping to a hard error that would mask a recoverable blip.
        const status = stateRef.current.status;
        if (status === "starting" || status === "running") {
          updateState((prev) => ({
            ...prev,
            errorMessage: "Connection interrupted, reconnecting…",
          }));
        }
        es.close();
      };
    },
    [updateState]
  );

  const approve = useCallback(
    async (approved: boolean) => {
      const { runId, pendingApproval } = stateRef.current;
      if (!runId || !pendingApproval) return;
      const approvalId = pendingApproval.id;
      // Any delayed work below (the reject beat, the approve health poll) belongs to
      // THIS run. If the operator resets or starts a new run, the active runId changes;
      // bail so a stale callback can never mutate a different run's state.
      const isCurrentRun = () => stateRef.current.runId === runId;

      if (!approved) {
        // Reject is deterministic: the agent stands down and nothing changes, so
        // there is no async outcome to poll for (unlike approve, which confirms real
        // recovery). But the decision must be DURABLE - the backend records the
        // rejection in the audit ledger only when this POST lands, so we await it
        // (it returns fast) and surface a failure rather than claim a "declined" the
        // ledger never recorded. Then a short beat lets the "Rejected, standing down"
        // moment read, and we synthesize the Declined terminal in case Cloud Run
        // stalled the SSE stream.
        try {
          await submitApproval(runId, approvalId, false);
        } catch (err) {
          updateState((prev) => ({
            ...prev,
            errorMessage: err instanceof Error ? err.message : "Could not submit your rejection",
          }));
          return;
        }
        await new Promise((r) => setTimeout(r, 700));
        const REJECT_TERMINAL: RunStatus[] = ["resolved", "declined", "all_clear", "error"];
        if (!isCurrentRun() || REJECT_TERMINAL.includes(stateRef.current.status)) return;
        esRef.current?.close(); // stop late duplicate frames once we synthesize
        const rejectedResolved: ApprovalResolvedEvent = {
          type: "approval_resolved", run_id: runId, seq: Number.MAX_SAFE_INTEGER - 1,
          id: approvalId, approved: false,
        };
        const declinedFinal: FinalEvent = {
          type: "final", run_id: runId, seq: Number.MAX_SAFE_INTEGER,
          report:
            "You rejected the proposed remediation, so the agent stood down. Nothing was changed on checkout-api; the incident stays open for manual handling.",
          service_healthy: false, incident_resolved: false, outcome: "declined",
        };
        updateState((prev) => processEvent(processEvent(prev, rejectedResolved), declinedFinal));
        return;
      }

      // Approve path: the decision must land before we can observe recovery.
      try {
        await submitApproval(runId, approvalId, true);
      } catch (err) {
        updateState((prev) => ({
          ...prev,
          errorMessage: err instanceof Error ? err.message : "Approval failed",
        }));
        return;
      }

      // Fallback reconciliation: on Cloud Run the SSE stream can go stale during
      // the human-approval pause, so the post-approval frames (approval_resolved →
      // tool_result → verify → final) may never reach the browser even though the
      // backend executes the remediation. Poll the live health endpoint; once the
      // service is healthy and the fault is cleared, synthesize the resolved state
      // so the UI flips to green regardless of the stream. If the real `final`
      // arrives first, the terminal-status guard makes this a no-op.
      const TERMINAL: RunStatus[] = ["resolved", "declined", "all_clear", "error"];
      for (let i = 0; i < 24; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        if (!isCurrentRun() || TERMINAL.includes(stateRef.current.status)) return; // run changed, or SSE won
        try {
          const h = await getHealth();
          if (h.healthy && !h.injected_fault) {
            if (!isCurrentRun() || TERMINAL.includes(stateRef.current.status)) return;
            esRef.current?.close(); // stop trailing real frames from resurrecting the terminal
            // Clear the approval modal, then flip to a resolved terminal state.
            const resolvedEvent: ApprovalResolvedEvent = {
              type: "approval_resolved", run_id: runId, seq: Number.MAX_SAFE_INTEGER - 1,
              id: approvalId, approved: true,
            };
            const finalEvent: FinalEvent = {
              type: "final", run_id: runId, seq: Number.MAX_SAFE_INTEGER,
              report: "Remediation approved and applied. checkout-api health check confirms the incident is resolved, and the service is healthy.",
              service_healthy: true, incident_resolved: true, outcome: "resolved",
            };
            updateState((prev) => processEvent(processEvent(prev, resolvedEvent), finalEvent));
            return;
          }
        } catch {
          // transient health-check error - keep polling
        }
      }
    },
    [updateState]
  );

  const reset = useCallback(async () => {
    esRef.current?.close();
    try {
      await resetFaults();
    } catch {
      // ignore mock reset errors
    }
    updateState(() => ({ ...INITIAL_STATE }));
  }, [updateState]);

  return { state, startIncident, approve, reset };
}
