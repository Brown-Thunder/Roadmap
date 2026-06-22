import { listInitiatives } from "@/lib/airtable";
import { listRoadmapInitiatives } from "@/lib/roadmap-initiatives";
import { isRoadmapPublished } from "@/lib/settings";
import AppShell from "@/components/AppShell";
import ErrorState from "@/components/ErrorState";
import { Initiative } from "@/lib/types";
import { RoadmapInitiative } from "@/lib/roadmap-initiatives";
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

    if (email && (await isEditorEmail(email))) {
      redirect("/");
    }
  }

  let initiatives: Initiative[] = [];
  let roadmapInitiatives: RoadmapInitiative[] = [];
  let roadmapPublished = false;
  let error: string | null = null;
  try {
    [initiatives, roadmapInitiatives, roadmapPublished] = await Promise.all([
      listInitiatives(),
      listRoadmapInitiatives().catch(() => []),
      isRoadmapPublished().catch(() => false),
    ]);
  } catch (e: any) {
    error = e?.message || "Failed to load initiatives.";
  }

  if (error) return <ErrorState error={error} />;

  return (
    <AppShell
      initiatives={initiatives}
      roadmapInitiatives={roadmapInitiatives}
      readOnly={true}
      roadmapPublished={roadmapPublished}
    />
  );
}
