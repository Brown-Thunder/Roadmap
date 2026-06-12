import { NextRequest, NextResponse } from "next/server";
import { listInitiatives } from "@/lib/airtable";
import { openDm, uploadImage } from "@/lib/slack";
import { buildSummary, appUrl } from "@/lib/summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Triggered weekly by Vercel Cron (see vercel.json).
// Generates the snapshot and DMs it to the approver for review before posting.
export async function GET(req: NextRequest) {
  // Verify the request came from Vercel Cron (or a trusted caller).
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const origin = req.nextUrl.origin;
    const team = "All";

    // Render the snapshot via the OG route
    const ogUrl = `${origin}/api/og?team=${encodeURIComponent(team)}`;
    const res = await fetch(ogUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`Snapshot render failed: ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());

    const initiatives = await listInitiatives();
    const reviewUrl = `${appUrl(origin)}/review`;
    const comment =
      `:eyes: *Weekly roadmap draft for your approval*\n` +
      buildSummary(initiatives, team, origin) +
      `\n\nReview & publish to <#${process.env.SLACK_CHANNEL_ID}> here: ${reviewUrl}`;

    const approver = process.env.SLACK_APPROVER_USER_ID;
    if (!approver) throw new Error("SLACK_APPROVER_USER_ID is not configured.");
    const dm = await openDm(approver);

    const filename = `roadmap-${new Date().toISOString().slice(0, 10)}.png`;
    await uploadImage(dm, filename, bytes, comment, "Weekly Priorities (draft)");

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
