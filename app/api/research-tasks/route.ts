import { NextRequest, NextResponse } from "next/server";
import { listResearchTasks, createResearchTask } from "@/lib/research-tasks";
import { requireEditor } from "@/lib/research-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await listResearchTasks();
    return NextResponse.json({ ok: true, tasks: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!(await requireEditor())) {
      return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 403 });
    }
    const body = await req.json();
    const created = await createResearchTask(body);
    return NextResponse.json({ ok: true, task: created });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
