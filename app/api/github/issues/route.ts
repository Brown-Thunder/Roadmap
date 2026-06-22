import { NextRequest, NextResponse } from "next/server";
import { listProjectIssues, invalidateGithubCache, githubConfigured } from "@/lib/github";
import { githubLoginMap } from "@/lib/people";

export const dynamic = "force-dynamic";

// GET /api/github/issues         — serve cached full issue list (all teams)
// GET /api/github/issues?refresh — bust cache then re-crawl
export async function GET(req: NextRequest) {
  if (!githubConfigured()) {
    return NextResponse.json({ ok: true, configured: false, issues: [] });
  }
  if (req.nextUrl.searchParams.has("refresh")) {
    invalidateGithubCache();
  }
  try {
    const [issues, loginMap] = await Promise.all([listProjectIssues("All"), githubLoginMap()]);
    const enriched = issues.map((i) => ({
      ...i,
      mappedAssignees: i.assignees.map((login) => loginMap[login.toLowerCase()] || login),
    }));
    return NextResponse.json({ ok: true, configured: true, issues: enriched });
  } catch (e: any) {
    return NextResponse.json({ ok: false, configured: true, error: e.message }, { status: 500 });
  }
}
