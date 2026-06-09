// API client - reads NEXT_PUBLIC_AGENT_BASE_URL; falls back to /api (mock mode)
import type { FaultType, ServiceHealth, RiskAssessment } from "./types";

// Single source of truth for the public repo link (nav, hero, footer, etc.).
export const REPO_URL = "https://github.com/thylinao1/autosre";

function baseUrl(): string {
  const env = process.env.NEXT_PUBLIC_AGENT_BASE_URL;
  if (env && env.length > 0) return env.replace(/\/$/, "");
  return ""; // relative - hits the Next.js route handlers (mock mode)
}

export async function startRun(inject: FaultType | null): Promise<{ run_id: string; status: string }> {
  const body: Record<string, string> = {};
  if (inject) body.inject = inject;

  const res = await fetch(`${baseUrl()}/api/incident/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`start failed: ${res.status}`);
  return res.json() as Promise<{ run_id: string; status: string }>;
}

export function streamUrl(runId: string): string {
  return `${baseUrl()}/api/incident/${runId}/stream`;
}

export async function submitApproval(
  runId: string,
  confirmationId: string,
  approved: boolean
): Promise<void> {
  const res = await fetch(`${baseUrl()}/api/incident/${runId}/approval`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmation_id: confirmationId, approved }),
  });
  if (!res.ok) throw new Error(`approval failed: ${res.status}`);
}

export async function injectFault(fault: FaultType): Promise<void> {
  const res = await fetch(`${baseUrl()}/api/demo/inject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fault }),
  });
  if (!res.ok) throw new Error(`inject failed: ${res.status}`);
}

export async function resetFaults(): Promise<void> {
  const res = await fetch(`${baseUrl()}/api/demo/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`reset failed: ${res.status}`);
}

export async function getHealth(): Promise<ServiceHealth> {
  const res = await fetch(`${baseUrl()}/api/demo/health`);
  if (!res.ok) throw new Error(`health failed: ${res.status}`);
  return res.json() as Promise<ServiceHealth>;
}

export interface LedgerEntry {
  ts: number;
  operator: string;
  run_id: string;
  incident: string | null;
  action: { tool: string; args: Record<string, unknown> } | null;
  decision: "approved" | "rejected" | "none";
  outcome: string;
  service_healthy?: boolean;
  incident_resolved?: boolean;
  // Seeded placeholder so a cold redeploy is never empty.
  example?: boolean;
  // Resolved by policy without a human (graduated autonomy).
  auto_approved?: boolean;
  // Graduated-autonomy risk tier recorded with the decision.
  risk?: RiskAssessment;
}

// Status of the most recent attempt to write the decision back to Dynatrace.
// `ok` = the write actually landed; `verified` = a read-back DQL confirmed it is
// queryable in the tenant. Distinct from `dynatrace_writeback` (creds present).
export interface LastWriteback {
  attempted: boolean;
  ok: boolean | null;
  status: number | null;
  verified: boolean | null;
  error: string | null;
  ts: number | null;
}

export interface LedgerResponse {
  entries: LedgerEntry[];
  dynatrace_writeback: boolean;
  last_writeback?: LastWriteback;
}

export async function getLedger(limit = 25): Promise<LedgerResponse> {
  const res = await fetch(`${baseUrl()}/api/ledger?limit=${limit}`);
  if (!res.ok) throw new Error(`ledger failed: ${res.status}`);
  return res.json() as Promise<LedgerResponse>;
}
