// GitHub Project (v2) integration — reads issues from the "Stasher V3" org
// project (stasher-city / project #16) so they can prefill a new initiative.
//
// Projects v2 is GraphQL-only. A team maps to a set of Squads: the picker shows
// every ticket (parent or child) tagged with one of the team's squads, in any
// repo and at any status. Results are grouped by squad and ordered by status.
//
// Env:
//   GITHUB_TOKEN            fine-grained PAT or org token (read: projects + issues)
//   GITHUB_ORG              org login (default "stasher-city")
//   GITHUB_PROJECT_NUMBER   project number (default 16)

const GITHUB_GRAPHQL = "https://api.github.com/graphql";

export type TeamFilter = "Backend" | "Frontend" | "All";

export interface GithubIssue {
  id: string;
  number: number;
  title: string;
  url: string;
  state: string;       // OPEN | CLOSED | MERGED
  repository: string;  // "owner/name"
  assignees: string[]; // GitHub logins
  mappedAssignees?: string[]; // display names resolved from logins (added by the API route)
  status: string;      // project "Status" single-select value
  squad: string;       // project "Squad" single-select value
  isPR: boolean;
}

// Squad single-select options on the V3 board, split by team. Used to decide
// which team an issue belongs to and to group the picker.
//   Backend  = Host, Platform
//   Frontend = Conversion, App, Organic, Admin dashboard
export const BACKEND_SQUADS = ["Host", "Platform"] as const;
export const FRONTEND_SQUADS = ["Conversion", "App", "Organic", "Admin dashboard"] as const;

// Canonical grouping/sort order for squads (backend squads first), then any others.
export const SQUAD_ORDER = [...BACKEND_SQUADS, ...FRONTEND_SQUADS] as readonly string[];

// Status column order on the V3 board — used to sort issues within a squad group.
// Anything not listed sorts to the end (in board-agnostic issue-number order).
export const STATUS_ORDER = [
  "To Do",
  "In progress",
  "For review",
  "In Review",
  "QA Testing",
  "Ready for merge",
  "Ready for next release",
  "Done",
  "Backlog",
  "Blocked",
] as const;

// The squads that make up each team. A team matches every ticket (parent or
// child) tagged with one of its squads — regardless of repo or status.
const TEAM_SQUADS: Record<"Backend" | "Frontend", readonly string[]> = {
  Backend: BACKEND_SQUADS,
  Frontend: FRONTEND_SQUADS,
};

// True if an issue's squad belongs to the given team.
export function issueMatchesTeam(
  issue: Pick<GithubIssue, "squad">,
  team: "Backend" | "Frontend",
): boolean {
  return TEAM_SQUADS[team].includes(issue.squad);
}

function cfg() {
  const token = process.env.GITHUB_TOKEN;
  const org = process.env.GITHUB_ORG || "stasher-city";
  const projectNumber = Number(process.env.GITHUB_PROJECT_NUMBER || "16");
  if (!token) throw new Error("GITHUB_TOKEN is not configured.");
  if (!projectNumber) throw new Error("GITHUB_PROJECT_NUMBER is not configured.");
  return { token, org, projectNumber };
}

export function githubConfigured(): boolean {
  return Boolean(process.env.GITHUB_TOKEN);
}

async function gql<T>(query: string, variables: Record<string, any>, token: string): Promise<T> {
  const res = await fetch(GITHUB_GRAPHQL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "stasher-weekly-priorities",
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  const json = await res.json();

  // GitHub returns PARTIAL data + per-node errors when some board items live in
  // repos this token can't read ("Resource not accessible by personal access
  // token"). Those nodes come back with content:null. That's expected — we skip
  // them — so only treat errors as fatal when NO usable data came back.
  if (json.data) return json.data as T;

  if (!res.ok || json.errors) {
    const msg = json.errors?.map((e: any) => e.message).join("; ") || `GitHub API ${res.status}`;
    throw new Error(msg);
  }
  return json.data as T;
}

const ITEMS_QUERY = `
query ($org: String!, $number: Int!, $cursor: String) {
  organization(login: $org) {
    projectV2(number: $number) {
      title
      items(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          status: fieldValueByName(name: "Status") {
            ... on ProjectV2ItemFieldSingleSelectValue { name }
          }
          squad: fieldValueByName(name: "Squad") {
            ... on ProjectV2ItemFieldSingleSelectValue { name }
          }
          content {
            __typename
            ... on Issue {
              id number title url state
              repository { nameWithOwner name }
              assignees(first: 10) { nodes { login } }
            }
            ... on PullRequest {
              id number title url state
              repository { nameWithOwner name }
              assignees(first: 10) { nodes { login } }
            }
          }
        }
      }
    }
  }
}`;

interface ContentNode {
  __typename: "Issue" | "PullRequest";
  id: string;
  number: number;
  title: string;
  url: string;
  state: string;
  repository: { nameWithOwner: string; name: string };
  assignees: { nodes: Array<{ login: string }> };
}

interface ItemsResponse {
  organization: {
    projectV2: {
      title: string;
      items: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: Array<{
          status: { name?: string } | null;
          squad: { name?: string } | null;
          content: ContentNode | null;
        }>;
      };
    } | null;
  } | null;
}

// In-memory cache of the whole board. The crawl is ~10s, but the board barely
// changes minute to minute, so we serve it from cache (and share one in-flight
// request) instead of re-crawling on every modal open / team switch.
const CACHE_TTL_MS = 5 * 60 * 1000;
let boardCache: { at: number; data: GithubIssue[] } | null = null;
let boardInflight: Promise<GithubIssue[]> | null = null;

function fetchAll(): Promise<GithubIssue[]> {
  if (boardCache && Date.now() - boardCache.at < CACHE_TTL_MS) {
    return Promise.resolve(boardCache.data);
  }
  // Coalesce concurrent callers onto a single crawl.
  if (boardInflight) return boardInflight;
  boardInflight = crawlBoard()
    .then((data) => {
      boardCache = { at: Date.now(), data };
      return data;
    })
    .finally(() => { boardInflight = null; });
  return boardInflight;
}

// Force a fresh crawl on the next call (used by the manual refresh button).
export function invalidateGithubCache() {
  boardCache = null;
}

// Fetch every item on the board (issues + PRs) with their Status/Squad values.
async function crawlBoard(): Promise<GithubIssue[]> {
  const { token, org, projectNumber } = cfg();
  const out: GithubIssue[] = [];
  let cursor: string | null = null;

  do {
    const data: ItemsResponse = await gql<ItemsResponse>(
      ITEMS_QUERY,
      { org, number: projectNumber, cursor },
      token
    );
    const project = data.organization?.projectV2;
    if (!project) throw new Error(`Project #${projectNumber} not found in org "${org}".`);

    for (const node of project.items.nodes) {
      const c = node.content;
      if (!c) continue; // draft items have no content
      out.push({
        id: c.id,
        number: c.number,
        title: c.title,
        url: c.url,
        state: c.state,
        repository: c.repository?.nameWithOwner || "",
        assignees: c.assignees?.nodes?.map((a) => a.login) ?? [],
        status: node.status?.name || "",
        squad: node.squad?.name || "",
        isPR: c.__typename === "PullRequest",
      });
    }

    const page = project.items.pageInfo;
    cursor = page.hasNextPage ? page.endCursor : null;
  } while (cursor);

  return out;
}

// Sort key helpers: known squads/statuses sort by their board order; anything
// else falls to the end of its dimension.
function squadRank(squad: string): number {
  const i = SQUAD_ORDER.indexOf(squad);
  return i === -1 ? SQUAD_ORDER.length : i;
}
function statusRank(status: string): number {
  const i = (STATUS_ORDER as readonly string[]).indexOf(status);
  return i === -1 ? STATUS_ORDER.length : i;
}

// List issues for the picker. When a team is selected, every ticket tagged with
// one of that team's squads is shown (any repo, any status). team "All" returns
// every issue. Results are grouped by squad (backend squads first) and ordered
// by status within each group, then by issue number.
export async function listProjectIssues(team: TeamFilter = "All"): Promise<GithubIssue[]> {
  const all = await fetchAll();

  let filtered = all.filter((i) => !i.isPR); // issues only
  if (team === "Backend" || team === "Frontend") {
    filtered = filtered.filter((i) => issueMatchesTeam(i, team));
  }

  return filtered.sort((a, b) => {
    const sq = squadRank(a.squad) - squadRank(b.squad);
    if (sq !== 0) return sq;
    if (a.squad !== b.squad) return a.squad.localeCompare(b.squad); // stable for unknown squads
    const st = statusRank(a.status) - statusRank(b.status);
    if (st !== 0) return st;
    return a.number - b.number;
  });
}
