import { NextRequest, NextResponse } from "next/server";
import { listInitiatives, createInitiative } from "@/lib/airtable";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await listInitiatives();
    return NextResponse.json({ ok: true, initiatives: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const created = await createInitiative(body);
    return NextResponse.json({ ok: true, initiative: created });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
