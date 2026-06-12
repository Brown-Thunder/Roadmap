import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { isEditorEmail, getEditors, addEditor, removeEditor } from "@/lib/auth";

async function resolveEmail(userId: string): Promise<string | null> {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    return user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
  } catch {
    return null;
  }
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const email = await resolveEmail(userId);
  if (!(await isEditorEmail(email))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const editors = await getEditors();
  return NextResponse.json({ editors });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const email = await resolveEmail(userId);
  if (!(await isEditorEmail(email))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { email: newEmail, name = "" } = await req.json();
  if (!newEmail || typeof newEmail !== "string") {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }
  const editors = await addEditor(newEmail, name);
  return NextResponse.json({ editors });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const callerEmail = await resolveEmail(userId);
  if (!(await isEditorEmail(callerEmail))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, email: removeEmail } = await req.json();
  if (removeEmail?.trim().toLowerCase() === callerEmail?.toLowerCase()) {
    return NextResponse.json({ error: "Cannot remove yourself" }, { status: 400 });
  }
  const editors = await removeEditor(id);
  return NextResponse.json({ editors });
}
