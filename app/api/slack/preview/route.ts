import { NextRequest, NextResponse } from "next/server";
import { listInitiatives } from "@/lib/airtable";
import { buildSummary } from "@/lib/summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Body: { team?: string }
// Returns the Slack message text that would be posted, without posting it.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const team: string = body.team || "All";
    const initiatives = await listInitiatives();
    const message = buildSummary(initiatives, team);
    return NextResponse.json({ ok: true, message });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
