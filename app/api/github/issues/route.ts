import { NextRequest, NextResponse } from "next/server";
import { listProjectIssues, githubConfigured, TeamFilter } from "@/lib/github";
import { githubLoginMap } from "@/lib/people";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!githubConfigured()) {
    // Not an error — the picker just stays hidden if GitHub isn't set up.
    return NextResponse.json({ ok: true, configured: false, issues: [] });
  }
  const teamParam = req.nextUrl.searchParams.get("team") || "All";
  const team: TeamFilter =
    teamParam === "Host/Platform" || teamParam === "Customer" ? teamParam : "All";
  try {
    const [issues, loginMap] = await Promise.all([listProjectIssues(team), githubLoginMap()]);
    // Resolve GitHub logins to roadmap display names where we have a mapping;
    // unknown logins fall through unchanged so the PM can still see who it is.
    const enriched = issues.map((i) => ({
      ...i,
      mappedAssignees: i.assignees.map((login) => loginMap[login.toLowerCase()] || login),
    }));
    return NextResponse.json({ ok: true, configured: true, issues: enriched });
  } catch (e: any) {
    return NextResponse.json({ ok: false, configured: true, error: e.message }, { status: 500 });
  }
}
