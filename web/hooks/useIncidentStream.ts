"use client";

import { useCallback, useRef, useState } from "react";
import { startRun, streamUrl, submitApproval, resetFaults } from "@/lib/api";
import type {
  IncidentState,
  SSEEvent,
  StepEvent,
  ToolResultEvent,
  ApprovalRequestEvent,
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

function processEvent(prev: IncidentState, event: SSEEvent): IncidentState {
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
        // Capture the DQL string when we see execute-dql (real Dynatrace param name)
        dqlQuery:
          tc.name === "execute-dql" && tc.args.dqlQueryString
            ? (tc.args.dqlQueryString as string)
            : prev.dqlQuery,
      };
    }

    case "tool_result": {
      const tr = event as ToolResultEvent;
      let nextState = { ...prev };

      // Extract problem from query-problems result
      if (tr.name === "query-problems") {
        const problems = (tr.response?.problems as DynatraceProblem[]) ?? [];
        if (problems.length > 0) {
          nextState.problem = problems[0];
        }
      }

      // Extract DQL records from execute-dql result
      if (tr.name === "execute-dql" && tr.response?.records) {
        nextState.dqlRecords = tr.response.records as DqlRecord[];
      }

      return {
        ...nextState,
        timeline: addEntry(`result: ${tr.summary}`, undefined),
      };
    }

    case "agent_message": {
      const am = event as AgentMessageEvent;
      return {
        ...prev,
        agentReasoning: am.done ? am.text : prev.agentReasoning + am.text,
        timeline: addEntry("Agent reasoning…", am.text.slice(0, 80) + (am.text.length > 80 ? "…" : "")),
      };
    }

    case "approval_request": {
      const ar = event as ApprovalRequestEvent;
      return {
        ...prev,
        pendingApproval: ar,
        status: "awaiting_approval",
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
          resolved.approved ? "Approved — executing remediation" : "Rejected — standing down",
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

      return {
        ...prev,
        finalEvent: f,
        status,
        timeline: addEntry(
          f.service_healthy ? "Service restored — incident resolved" : "Run complete",
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

      updateState(() => ({ ...INITIAL_STATE, status: "starting" }));

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
            // malformed frame — ignore
          }
        });
      }

      es.onerror = () => {
        // SSE connection closed after final/error is normal
        if (
          stateRef.current.status !== "resolved" &&
          stateRef.current.status !== "declined" &&
          stateRef.current.status !== "all_clear"
        ) {
          // Only treat as error if not already in a terminal state
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

      try {
        await submitApproval(runId, pendingApproval.id, approved);
      } catch (err) {
        updateState((prev) => ({
          ...prev,
          errorMessage: err instanceof Error ? err.message : "Approval failed",
        }));
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
