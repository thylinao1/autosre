import { NextResponse } from "next/server";

// Mock POST /api/demo/reset
export async function POST(): Promise<NextResponse> {
  return NextResponse.json({ injected: null });
}
