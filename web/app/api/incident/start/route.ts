import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

// Mock: POST /api/incident/start
// In live mode this is served by the backend agent (NEXT_PUBLIC_AGENT_BASE_URL).
// In mock mode (no env var set) Next.js serves this route.
export async function POST(_req: NextRequest): Promise<NextResponse> {
  const runId = randomUUID();
  return NextResponse.json({ run_id: runId, status: "started" });
}
