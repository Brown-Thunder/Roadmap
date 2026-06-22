import { NextRequest, NextResponse } from "next/server";
import { listRoadmapInitiatives, createRoadmapInitiative } from "@/lib/roadmap-initiatives";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await listRoadmapInitiatives();
    return NextResponse.json({ ok: true, initiatives: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const created = await createRoadmapInitiative(body);
    return NextResponse.json({ ok: true, initiative: created });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
