import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { isEditorEmail } from "@/lib/auth";
import { isRoadmapPublished, setRoadmapPublished } from "@/lib/settings";

export const dynamic = "force-dynamic";

async function currentUserIsEditor(): Promise<boolean> {
  const { userId } = await auth();
  if (!userId) return false;
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const email =
      user.primaryEmailAddress?.emailAddress ??
      user.emailAddresses[0]?.emailAddress ??
      null;
    return email ? await isEditorEmail(email) : false;
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    const published = await isRoadmapPublished();
    return NextResponse.json({ ok: true, published });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!(await currentUserIsEditor())) {
      return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 403 });
    }
    const body = await req.json();
    const published = Boolean(body.published);
    await setRoadmapPublished(published);
    return NextResponse.json({ ok: true, published });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
