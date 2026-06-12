import { NextRequest, NextResponse } from "next/server";
import { listInitiatives } from "@/lib/airtable";
import { openDm, uploadImage } from "@/lib/slack";
import { buildSummary, dataUrlToBytes, appUrl } from "@/lib/summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Body: { image?: dataUrl, team?: string, draft?: boolean }
// - image present  -> use the browser-captured PNG (WYSIWYG)
// - image absent   -> render the snapshot via the /api/og route
// - draft true     -> DM the snapshot to SLACK_APPROVER_USER_ID for review
// - draft false    -> post the snapshot to SLACK_CHANNEL_ID
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const team: string = body.team || "All";
    const draft: boolean = Boolean(body.draft);
    const origin = req.nextUrl.origin;

    // 1) Get the image bytes
    let bytes: Uint8Array;
    if (body.image) {
      bytes = dataUrlToBytes(body.image);
    } else {
      const ogUrl = `${origin}/api/og?team=${encodeURIComponent(team)}`;
      const res = await fetch(ogUrl, { cache: "no-store" });
      if (!res.ok) throw new Error(`Snapshot render failed: ${res.status}`);
      bytes = new Uint8Array(await res.arrayBuffer());
    }

    // 2) Build the accompanying text
    const initiatives = await listInitiatives();
    let comment = buildSummary(initiatives, team, origin);

    // 3) Resolve destination
    let channel: string;
    if (draft) {
      const approver = process.env.SLACK_APPROVER_USER_ID;
      if (!approver)
        throw new Error("SLACK_APPROVER_USER_ID is not configured.");
      channel = await openDm(approver);
      const reviewUrl = `${appUrl(origin)}/review`;
      comment =
        `:eyes: *Draft roadmap snapshot for your approval*\n` +
        comment +
        `\n\nReview & publish to <#${process.env.SLACK_CHANNEL_ID}> here: ${reviewUrl}`;
    } else {
      const ch = process.env.SLACK_CHANNEL_ID;
      if (!ch) throw new Error("SLACK_CHANNEL_ID is not configured.");
      channel = ch;
    }

    const filename = `roadmap-${new Date().toISOString().slice(0, 10)}.png`;
    await uploadImage(channel, filename, bytes, comment, "Weekly Priorities");

    return NextResponse.json({ ok: true, draft });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
