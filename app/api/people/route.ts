import { NextRequest, NextResponse } from "next/server";
import { listPeople, addPerson } from "@/lib/people";
import { NAMED_ASSIGNEE_COLORS, UNASSIGNED_ASSIGNEE_COLOR } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const people = await listPeople();
    // Build a name(lowercased) -> full colour swatch map from each person's
    // assigned named colour, so the board can colour cards by assignee.
    const colours: Record<string, typeof UNASSIGNED_ASSIGNEE_COLOR> = {};
    for (const p of people) {
      if (p.colour && NAMED_ASSIGNEE_COLORS[p.colour]) {
        colours[p.name.toLowerCase()] = NAMED_ASSIGNEE_COLORS[p.colour];
      }
    }
    return NextResponse.json({ ok: true, people, colours });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = (body?.name || "").trim();
    if (!name) return NextResponse.json({ ok: false, error: "Name is required" }, { status: 400 });
    const person = await addPerson(name, body?.githubLogin || "");
    return NextResponse.json({ ok: true, person });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
