import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getEditors } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();

  let email: string | null = null;
  let clerkError: string | null = null;
  try {
    if (userId) {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
    }
  } catch (e: any) {
    clerkError = e?.message ?? String(e);
  }

  let editors: any[] = [];
  let airtableError: string | null = null;
  try {
    editors = await getEditors();
  } catch (e: any) {
    airtableError = e?.message ?? String(e);
  }

  const isEditor = editors.some((e) => e.email === email?.trim().toLowerCase());

  return NextResponse.json({
    userId,
    email,
    clerkError,
    editors,
    airtableError,
    isEditor,
    env: {
      hasApiKey: !!process.env.AIRTABLE_API_KEY,
      hasBaseId: !!process.env.AIRTABLE_BASE_ID,
    },
  });
}
