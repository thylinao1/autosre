import { NextRequest, NextResponse } from "next/server";
import { resolveApproval } from "../stream/route";

// POST /api/incident/[runId]/approval
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
): Promise<NextResponse> {
  const { runId } = await params;
  const body = (await req.json()) as { confirmation_id: string; approved: boolean };

  const { confirmation_id, approved } = body;

  const ok = resolveApproval(runId, approved);
  if (!ok) {
    return NextResponse.json(
      { error: "No pending approval for this run" },
      { status: 409 }
    );
  }

  return NextResponse.json({
    status: "accepted",
    confirmation_id,
    approved,
  });
}
