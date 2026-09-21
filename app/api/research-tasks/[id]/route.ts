import { NextRequest, NextResponse } from "next/server";
import { updateResearchTask, deleteResearchTask } from "@/lib/research-tasks";
import { requireEditor } from "@/lib/research-auth";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!(await requireEditor())) {
      return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 403 });
    }
    const { id } = await params;
    const body = await req.json();
    const updated = await updateResearchTask(id, body);
    return NextResponse.json({ ok: true, task: updated });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!(await requireEditor())) {
      return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 403 });
    }
    const { id } = await params;
    await deleteResearchTask(id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
