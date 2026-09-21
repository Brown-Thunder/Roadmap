import { auth, clerkClient } from "@clerk/nextjs/server";
import { isEditorEmail } from "@/lib/auth";

// Research task writes are editor-only. Mirrors the check the roadmap publish
// route does; read access stays open to any signed-in allowlisted user.
export async function requireEditor(): Promise<boolean> {
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
