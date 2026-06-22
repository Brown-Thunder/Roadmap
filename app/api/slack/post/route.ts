import { NextRequest, NextResponse } from "next/server";
import { listInitiatives } from "@/lib/airtable";
import { uploadImage } from "@/lib/slack";
import { buildSummary, dataUrlToBytes } from "@/lib/summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Body: { image?: dataUrl, team?: string, message?: string }
// - image present   -> use the browser-captured PNG (WYSIWYG)
// - image absent    -> render the snapshot via the /api/og route
// - message present -> use as the Slack comment verbatim (edited by user in preview)
// - message absent  -> build from initiatives data
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const team: string = body.team || "All";
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

    // 2) Build or accept the accompanying text
    let comment: string;
    if (typeof body.message === "string" && body.message.trim()) {
      comment = body.message;
    } else {
      const initiatives = await listInitiatives();
      comment = buildSummary(initiatives, team, origin);
    }

    // 3) Resolve destination
    let channel: string;
    {
      const ch = process.env.SLACK_CHANNEL_ID;
      if (!ch) throw new Error("SLACK_CHANNEL_ID is not configured.");
      channel = ch;
    }

    const filename = `roadmap-${new Date().toISOString().slice(0, 10)}.png`;
    await uploadImage(channel, filename, bytes, comment, "Weekly Priorities");

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
