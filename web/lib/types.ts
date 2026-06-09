// Contract-compliant types for AutoSRE SSE events
// Mirrors CONTRACT.md §2 exactly - do NOT redefine these shapes.

export type Phase = "detect" | "diagnose" | "act" | "verify";
export type Severity = "AVAILABILITY" | "PERFORMANCE" | "ERROR" | "RESOURCE" | "CUSTOM_ALERT";
export type Outcome = "resolved" | "all_clear" | "declined" | "unresolved";
export type RemediationTool = "scale_service" | "rollback_deployment" | "toggle_feature_flag";
export type FaultType = "payment_errors" | "latency_spike";

// ── SSE events (discriminated union on `type`) ──────────────────────

export interface BaseEvent {
  type: string;
  run_id: string;
  seq: number;
}

export interface StepEvent extends BaseEvent {
  type: "step";
  phase: Phase;
  status: string;
}

export interface ToolCallEvent extends BaseEvent {
  type: "tool_call";
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResultEvent extends BaseEvent {
  type: "tool_result";
  name: string;
  summary: string;
  response: Record<string, unknown>;
}

// Graduated-autonomy risk tier of a proposed action. Lower tiers may be
// auto-approved by policy; higher tiers always route through a human.
export type RiskTier = "low" | "medium" | "high";

export interface RiskAssessment {
  tier: RiskTier;
  rationale: string;
}

export interface ApprovalRequestEvent extends BaseEvent {
  type: "approval_request";
  id: string;
  tool: RemediationTool;
  args: Record<string, unknown>;
  hint: string;
  // Optional: present when the backend attaches a graduated-autonomy risk tier.
  risk?: RiskAssessment;
}

export interface ApprovalResolvedEvent extends BaseEvent {
  type: "approval_resolved";
  id: string;
  approved: boolean;
}

export interface AgentMessageEvent extends BaseEvent {
  type: "agent_message";
  text: string;
  done: boolean;
}

export interface FinalEvent extends BaseEvent {
  type: "final";
  report: string;
  service_healthy: boolean;
  incident_resolved: boolean;
  outcome: Outcome;
}

export interface ErrorEvent extends BaseEvent {
  type: "error";
  message: string;
  retriable: boolean;
}

export type SSEEvent =
  | StepEvent
  | ToolCallEvent
  | ToolResultEvent
  | ApprovalRequestEvent
  | ApprovalResolvedEvent
  | AgentMessageEvent
  | FinalEvent
  | ErrorEvent;

// ── Domain models ────────────────────────────────────────────────────

export interface BlastRadius {
  requests_per_min?: number;
  failing_per_min?: number;
  downstream_services?: number;
  summary?: string;
}

export interface DynatraceProblem {
  problemId: string;
  title: string;
  severity: Severity;
  status: string;
  affected_entity: string;
  impacted_metric: string;
  observed_value: number;
  deploy_version?: string;
  active_feature_flags?: Record<string, boolean>;
  // Davis-shaped enrichment (root cause + blast radius), surfaced in the UI.
  root_cause_entity?: string;
  affected_entities?: string[];
  blast_radius?: BlastRadius;
}

export interface DqlRecord {
  timestamp?: string;
  [key: string]: unknown;
}

export interface ServiceHealth {
  version: string;
  replicas: number;
  feature_flags: Record<string, boolean>;
  injected_fault: string | null;
  healthy: boolean;
  metrics: {
    service: string;
    failure_rate: number;
    p99_latency_ms: number;
    requests_per_min: number;
    cpu_utilization: number;
    replicas: number;
    version: string;
  };
}

// ── UI state ─────────────────────────────────────────────────────────

export type RunStatus =
  | "idle"
  | "starting"
  | "running"
  | "awaiting_approval"
  | "resolved"
  | "declined"
  | "all_clear"
  | "error";

export interface TimelineEntry {
  id: string; // seq as string
  seq: number;
  phase?: Phase;
  kind: "step" | "tool_call" | "tool_result" | "agent_message" | "approval_request" | "approval_resolved" | "final" | "error";
  label: string;
  detail?: string;
  timestamp: number;
  raw: SSEEvent;
}

export interface IncidentState {
  runId: string | null;
  status: RunStatus;
  problem: DynatraceProblem | null;
  currentPhase: Phase | null;
  timeline: TimelineEntry[];
  dqlQuery: string | null;
  dqlRecords: DqlRecord[];
  agentReasoning: string;
  pendingApproval: ApprovalRequestEvent | null;
  finalEvent: FinalEvent | null;
  errorMessage: string | null;
  serviceHealth: ServiceHealth | null;
  // Wall-clock timing for the on-screen "time to resolution" readout. `startedAt`
  // is stamped when the sweep kicks off; `endedAt` freezes on the terminal frame.
  startedAt: number | null;
  endedAt: number | null;
  // Stamped when the approval_request frame arrives (the agent reached a proposed
  // fix). Lets the header split "model time" from "model time + your review time".
  proposedAt: number | null;
}
