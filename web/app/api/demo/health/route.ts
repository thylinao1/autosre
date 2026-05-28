import { NextResponse } from "next/server";

// Mock GET /api/demo/health
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    version: "2.3.1",
    replicas: 3,
    feature_flags: { new_payment_gateway: true },
    injected_fault: null,
    healthy: true,
    metrics: {
      service: "checkout-api",
      failure_rate: 0.4,
      p99_latency_ms: 210,
      requests_per_min: 1050,
      cpu_utilization: 44,
      replicas: 3,
      version: "2.3.1",
    },
  });
}
