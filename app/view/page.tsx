import { listInitiatives } from "@/lib/airtable";
import RoadmapBoard from "@/components/RoadmapBoard";
import ErrorState from "@/components/ErrorState";
import { Initiative } from "@/lib/types";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { isEditorEmail } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ViewPage() {
  const { userId } = await auth();
  if (userId) {
    let email: string | null = null;
    try {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
    } catch {}

    if (email && await isEditorEmail(email)) {
      redirect("/");
    }
  }

  let initiatives: Initiative[] = [];
  let error: string | null = null;
  try {
    initiatives = await listInitiatives();
  } catch (e: any) {
    error = e?.message || "Failed to load initiatives.";
  }

  if (error) return <ErrorState error={error} />;

  return <RoadmapBoard initial={initiatives} readOnly={true} />;
}
