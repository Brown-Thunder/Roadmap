import { NextRequest, NextResponse } from "next/server";
import { getBoardConfig, saveBoardConfig, BoardConfig } from "@/lib/boardConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = await getBoardConfig();
    return NextResponse.json({ ok: true, config });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const current = await getBoardConfig();
    const next: BoardConfig = {
      areaOrder: body.areaOrder ?? current.areaOrder,
      laneLabels: body.laneLabels ?? current.laneLabels,
    };
    await saveBoardConfig(next);
    return NextResponse.json({ ok: true, config: next });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
