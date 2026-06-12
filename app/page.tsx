import { listInitiatives } from "@/lib/airtable";
import RoadmapBoard from "@/components/RoadmapBoard";
import ErrorState from "@/components/ErrorState";
import { Initiative } from "@/lib/types";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { isEditorEmail } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { userId } = await auth();
  let editorAccess = false;
  if (userId) {
    try {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      const email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
      editorAccess = await isEditorEmail(email);
    } catch {}
  }

  let initiatives: Initiative[] = [];
  let error: string | null = null;
  try {
    initiatives = await listInitiatives();
  } catch (e: any) {
    error = e?.message || "Failed to load initiatives.";
  }

  if (error) return <ErrorState error={error} />;

  return <RoadmapBoard initial={initiatives} canManageEditors={editorAccess} />;
}
