import { NextRequest } from "next/server";

// Mock SSE stream — replays the happy-path event sequence from CONTRACT.md §2.9
// on a timer with an approval pause.  Point NEXT_PUBLIC_AGENT_BASE_URL at the
// real backend to bypass this entirely.

const RUN_ID_PLACEHOLDER = "__RUN_ID__";

function makeEvents(runId: string, inject: string): object[] {
  const isLatency = inject === "latency_spike";

  const problemTitle = isLatency
    ? "P99 latency spiked to 4,200ms on checkout-api"
    : "Checkout failure rate spiked to 22% after deploy v2.3.1";

  const problemSeverity = isLatency ? "PERFORMANCE" : "AVAILABILITY";
  const problemMetric = isLatency ? "p99_latency_ms" : "failure_rate";
  const problemValue = isLatency ? 4200 : 22.0;

  return [
    // 0 — detect phase marker
    {
      type: "step",
      run_id: runId,
      seq: 0,
      phase: "detect",
      status: "Pulling open problems from Dynatrace…",
    },
    // 1 — tool call: list_problems
    {
      type: "tool_call",
      run_id: runId,
      seq: 1,
      name: "list_problems",
      args: { entity: "checkout-api" },
    },
    // 2 — tool result: list_problems
    {
      type: "tool_result",
      run_id: runId,
      seq: 2,
      name: "list_problems",
      summary: `1 open problem: ${problemTitle}`,
      response: {
        problems: [
          {
            problemId: "P-2026-0042",
            title: problemTitle,
            severity: problemSeverity,
            status: "OPEN",
            affected_entity: "checkout-api",
            impacted_metric: problemMetric,
            observed_value: problemValue,
            deploy_version: "v2.3.1",
            active_feature_flags: isLatency
              ? { new_payment_gateway: true }
              : { new_payment_gateway: true },
          },
        ],
        total: 1,
      },
    },
    // 3 — diagnose phase marker
    {
      type: "step",
      run_id: runId,
      seq: 3,
      phase: "diagnose",
      status: "Running DQL evidence queries…",
    },
    // 4 — tool call: execute_dql
    {
      type: "tool_call",
      run_id: runId,
      seq: 4,
      name: "execute_dql",
      args: {
        query: isLatency
          ? 'fetch metrics | filter entity.name == "checkout-api" and metric.key == "response_time" | sort timestamp desc | limit 20'
          : 'fetch events | filter event.kind == "DEPLOYMENT_EVENT" and entity.name == "checkout-api" | sort timestamp desc | limit 1',
      },
    },
    // 5 — tool result: execute_dql
    {
      type: "tool_result",
      run_id: runId,
      seq: 5,
      name: "execute_dql",
      summary: isLatency
        ? "P99 latency climbed from 210ms baseline to 4,200ms after replica count dropped to 3."
        : "Deploy v2.3.1 at 14:32 UTC enabled feature flag 'new_payment_gateway' — correlated with failure spike.",
      response: {
        records: isLatency
          ? [
              { timestamp: "2026-05-28T14:32:00Z", entity: "checkout-api", metric: "response_time.p99", value_ms: 4200, replicas: 3 },
              { timestamp: "2026-05-28T14:28:00Z", entity: "checkout-api", metric: "response_time.p99", value_ms: 210, replicas: 8 },
            ]
          : [
              { timestamp: "2026-05-28T14:32:00Z", entity: "checkout-api", event: "DEPLOYMENT", version: "v2.3.1", changed_flags: "new_payment_gateway=true" },
              { timestamp: "2026-05-28T14:31:55Z", entity: "checkout-api", event: "DEPLOYMENT", version: "v2.3.0", changed_flags: "new_payment_gateway=false" },
            ],
      },
    },
    // 6 — agent reasoning message
    {
      type: "agent_message",
      run_id: runId,
      seq: 6,
      text: isLatency
        ? "Root cause identified: checkout-api is under-provisioned. Replica count fell from 8 to 3 at 14:28 UTC — P99 latency jumped 20x to 4,200ms. Scaling to 8 replicas should restore normal latency."
        : "Root cause identified: deploy v2.3.1 (14:32 UTC) enabled feature flag 'new_payment_gateway'. This gateway throws an unhandled exception on AMEX cards — driving a 22% failure rate. Disabling the flag will immediately restore service.",
      done: true,
    },
    // 7 — act phase marker
    {
      type: "step",
      run_id: runId,
      seq: 7,
      phase: "act",
      status: "Proposing remediation — awaiting operator approval…",
    },
    // 8 — approval_request (PAUSE HERE — client will send approval POST)
    {
      type: "approval_request",
      run_id: runId,
      seq: 8,
      id: "adk-fc-mock-001",
      tool: isLatency ? "scale_service" : "toggle_feature_flag",
      args: isLatency
        ? { replicas: 8 }
        : { name: "new_payment_gateway", enabled: false },
      hint: isLatency
        ? "Scale checkout-api from 3 to 8 replicas to absorb current traffic load."
        : "Disable the offending feature flag on checkout-api to stop AMEX payment failures.",
    },
  ];
}

function makePostApprovalEvents(runId: string, inject: string, approved: boolean): object[] {
  const isLatency = inject === "latency_spike";

  if (!approved) {
    return [
      {
        type: "approval_resolved",
        run_id: runId,
        seq: 9,
        id: "adk-fc-mock-001",
        approved: false,
      },
      {
        type: "final",
        run_id: runId,
        seq: 10,
        report: "Operator declined the proposed remediation. No changes made to checkout-api. The incident remains open.",
        service_healthy: false,
        incident_resolved: false,
        outcome: "declined",
      },
    ];
  }

  return [
    // 9 — approval_resolved
    {
      type: "approval_resolved",
      run_id: runId,
      seq: 9,
      id: "adk-fc-mock-001",
      approved: true,
    },
    // 10 — tool result for the remediation action
    {
      type: "tool_result",
      run_id: runId,
      seq: 10,
      name: isLatency ? "scale_service" : "toggle_feature_flag",
      summary: isLatency
        ? "Scaled checkout-api to 8 replicas. Rollout complete."
        : "Feature flag 'new_payment_gateway' disabled on checkout-api.",
      response: isLatency
        ? { scaled: true, replicas: 8, message: "Deployment scaled successfully." }
        : { toggled: true, name: "new_payment_gateway", enabled: false, message: "Flag disabled." },
    },
    // 11 — verify phase
    {
      type: "step",
      run_id: runId,
      seq: 11,
      phase: "verify",
      status: "Verifying service health…",
    },
    // 12 — get_service_health call
    {
      type: "tool_call",
      run_id: runId,
      seq: 12,
      name: "get_service_health",
      args: { service: "checkout-api" },
    },
    // 13 — health result
    {
      type: "tool_result",
      run_id: runId,
      seq: 13,
      name: "get_service_health",
      summary: "checkout-api is healthy. Failure rate: 0.3%. P99 latency: 195ms.",
      response: {
        service: "checkout-api",
        healthy: true,
        failure_rate: 0.3,
        p99_latency_ms: 195,
        replicas: isLatency ? 8 : 3,
        version: "v2.3.1",
      },
    },
    // 14 — final
    {
      type: "final",
      run_id: runId,
      seq: 14,
      report: isLatency
        ? "Detected P99 latency spike to 4,200ms on checkout-api. Root cause: under-provisioned replicas (3 → normal 8). Scaled to 8 replicas (operator-approved). Latency restored to 195ms P99. checkout-api is healthy."
        : "Detected 22% checkout failure rate from deploy v2.3.1. Root cause: feature flag 'new_payment_gateway' throwing on AMEX cards. Disabled the flag (operator-approved). Failure rate is 0.3%. checkout-api is healthy.",
      service_healthy: true,
      incident_resolved: true,
      outcome: "resolved",
    },
  ];
}

// In-memory store for pending approvals (mock only)
const pendingApprovals = new Map<string, { inject: string; resolve: (approved: boolean) => void }>();

export function registerPendingApproval(
  runId: string,
  inject: string,
  resolve: (approved: boolean) => void
): void {
  pendingApprovals.set(runId, { inject, resolve });
}

export function resolveApproval(runId: string, approved: boolean): boolean {
  const entry = pendingApprovals.get(runId);
  if (!entry) return false;
  entry.resolve(approved);
  pendingApprovals.delete(runId);
  return true;
}

// GET /api/incident/[runId]/stream
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
): Promise<Response> {
  const { runId } = await params;
  const inject = req.nextUrl.searchParams.get("inject") ?? "payment_errors";

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: object): void {
        const type = (event as Record<string, string>).type;
        const line = `event: ${type}\ndata: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(line));
      }

      const events = makeEvents(runId, inject);

      // Replay pre-approval events with delays
      const preApprovalEvents = events.slice(0, -1); // all except approval_request
      const approvalEvent = events[events.length - 1];

      for (let i = 0; i < preApprovalEvents.length; i++) {
        await delay(i === 0 ? 300 : 600);
        send(preApprovalEvents[i]);
      }

      // Send the approval_request
      await delay(700);
      send(approvalEvent);

      // Heartbeat + wait for approval decision
      const approved = await new Promise<boolean>((resolve) => {
        registerPendingApproval(runId, inject, resolve);

        // Auto-timeout after 5 minutes (safety net for mock)
        setTimeout(() => {
          if (pendingApprovals.has(runId)) {
            pendingApprovals.delete(runId);
            resolve(false);
          }
        }, 5 * 60 * 1000);
      });

      // Post-approval events
      const postEvents = makePostApprovalEvents(runId, inject, approved);
      for (const evt of postEvents) {
        await delay(700);
        send(evt);
      }

      await delay(200);
      controller.enqueue(encoder.encode(": done\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
