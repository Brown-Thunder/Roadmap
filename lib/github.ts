// GitHub Project (v2) integration — reads issues from the "Stashboard V2"
// org project (stasher-city / project #5) so they can prefill a new initiative.
//
// Projects v2 is GraphQL-only. The board's saved views (Hosts = view 42,
// Customers = view 41) are NOT readable via the API, so we replicate their
// filters in code using the Squad field + repo allowlist + status exclusions.
//
// Env:
//   GITHUB_TOKEN            fine-grained PAT or org token (read: projects + issues)
//   GITHUB_ORG              org login (default "stasher-city")
//   GITHUB_PROJECT_NUMBER   project number (default 5)

const GITHUB_GRAPHQL = "https://api.github.com/graphql";

export type TeamFilter = "Host/Platform" | "Customer" | "All";

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
  squad: string;       // project "Squad" single-select value (Supply/Demand)
  weekPlan2: string;   // project "Week Plan 2" DATE value (ISO "YYYY-MM-DD") or ""
  isPR: boolean;
}

// Replicates the two saved views. Repo names are matched on the short name
// (without the owner prefix).
const TEAM_VIEWS: Record<"Host/Platform" | "Customer", {
  squad: string;
  repos: string[];
  excludeStatuses: string[];
}> = {
  // Hosts view (42): squad:Supply, those repos, excluding Done/Released
  "Host/Platform": {
    squad: "Supply",
    repos: ["web", "api", "web-admin-dashboard", "web-hosts", "react-email-templates"],
    excludeStatuses: ["Done", "Released"],
  },
  // Customers view (41): squad:Demand, those repos, excluding the discovery
  // statuses + Known Issues
  Customer: {
    squad: "Demand",
    repos: ["web", "api", "dummy"],
    excludeStatuses: ["Discovery In Progress", "Discovery Backlog", "Discovery Done", "Known Issues"],
  },
};

function cfg() {
  const token = process.env.GITHUB_TOKEN;
  const org = process.env.GITHUB_ORG || "stasher-city";
  const projectNumber = Number(process.env.GITHUB_PROJECT_NUMBER || "5");
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
          weekPlan2: fieldValueByName(name: "Week Plan 2 ") {
            ... on ProjectV2ItemFieldDateValue { date }
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
          weekPlan2: { date?: string } | null;
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
        weekPlan2: node.weekPlan2?.date || "",
        isPR: c.__typename === "PullRequest",
      });
    }

    const page = project.items.pageInfo;
    cursor = page.hasNextPage ? page.endCursor : null;
  } while (cursor);

  return out;
}

function repoShortName(nameWithOwner: string): string {
  return nameWithOwner.split("/").pop() || nameWithOwner;
}

// List issues for the picker, replicating the saved-view filters per team.
// team "All" returns everything (still excludes PRs for initiative prefill).
export async function listProjectIssues(team: TeamFilter = "All"): Promise<GithubIssue[]> {
  const all = await fetchAll();

  let filtered = all.filter((i) => !i.isPR); // issues only

  const view = team !== "All" ? TEAM_VIEWS[team] : null;
  if (view) {
    filtered = filtered.filter((i) => {
      if (view.squad && i.squad !== view.squad) return false;
      if (view.repos.length && !view.repos.includes(repoShortName(i.repository))) return false;
      if (view.excludeStatuses.includes(i.status)) return false;
      return true;
    });
  }

  // Order by "Week Plan 2" date, newest first; undated (backlog) items last.
  // Within the same date/backlog, newest issue number first.
  return filtered.sort((a, b) => {
    if (a.weekPlan2 && b.weekPlan2) {
      if (a.weekPlan2 !== b.weekPlan2) return b.weekPlan2.localeCompare(a.weekPlan2);
    } else if (a.weekPlan2 !== b.weekPlan2) {
      return a.weekPlan2 ? -1 : 1; // dated before undated
    }
    return b.number - a.number;
  });
}
