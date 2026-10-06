import { NextResponse } from "next/server";
import { listRoadmapMilestones } from "@/lib/roadmap-initiatives";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const milestones = await listRoadmapMilestones();
    return NextResponse.json({ ok: true, milestones });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
