import { NextRequest, NextResponse } from "next/server";

// Mock POST /api/demo/inject
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as { fault: string };
  const { fault } = body;

  const summaries: Record<string, string> = {
    payment_errors: "Checkout failure rate spiked to 22% after deploy v2.3.1",
    latency_spike: "P99 latency spiked to 4,200ms on checkout-api",
  };

  return NextResponse.json({
    injected: fault,
    summary: summaries[fault] ?? "Fault injected",
  });
}
