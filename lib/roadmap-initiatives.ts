// ── Airtable "Product Roadmap" table — required fields ────────────────────────
// Add these fields to the table if they don't already exist:
//
//  Name            (Single line text)   — initiative name
//  Summary         (Single line text)   — group / swimlane header
//  Status          (Single select)      — Planned | In Progress | Done | On Hold
//  Strategy Goal   (Single select)      — 1.1 … 3.3
//  Owner           (Single line text)
//  Team            (Single select)      — Hosts | Customers
//  Quarter         (Single select)      — Q3 2026 … Q4 2027
//  End Quarter     (Single select)      — Q3 2026 … Q4 2027
//  Start Unit      (Number)             — fine-grained half-month offset
//  End Unit        (Number)             — fine-grained half-month offset (exclusive)
//  Main Bar Label  (Single line text)   — primary bar / workstream label (blank = use Name)
//  Main Bar Description       (Long text)        — the main workstream's own description
//  Main Bar North Star Metric (Single line text) — the main workstream's own north star
//  Main Bar Success Metrics   (Long text)        — the main workstream's own success metrics
//  Sub Bars        (Long text)          — JSON array of RoadmapSubBar
//  North Star Metric (Single line text) — headline metric this initiative moves
//  Success Metrics (Long text)          — how success will be tracked
//  Description     (Long text)
//  Notes           (Long text)
//  Comments        (Long text)          — JSON array of RoadmapComment
//  Order           (Number)             — sort order within swimlane
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = "https://api.airtable.com/v0";

export type RoadmapStatus = "Planned" | "In Progress" | "Done" | "On Hold";
export type StrategyGoal =
  | "1.1"
  | "1.2"
  | "1.3"
  | "2.1"
  | "2.2"
  | "2.3"
  | "3.1"
  | "3.2"
  | "3.3";

export const STRATEGY_GOAL_LABELS: Record<StrategyGoal, string> = {
  "1.1": "1.1 · Increase CVR of Tier 1 cities to UK levels",
  "1.2": "1.2 · Add 30 stashpoints capable of +£10k/yr each",
  "1.3": "1.3 · Rank Tier 1 city + area pages organically above position 3",
  "2.1": "2.1 · Systematically capture the latent demand we can already serve",
  "2.2": "2.2 · Add 10k stashpoints outside Tier 1",
  "2.3": "2.3 · Stay #1 for quality with the same-sized team",
  "3.1": "3.1 · Increase capacity in areas where we max out",
  "3.2": "3.2 · Own supply where we're confident in utilisation",
  "3.3": "3.3 · Position our brand in high-footfall zones",
};

export const ROADMAP_STATUS_OPTIONS: RoadmapStatus[] = [
  "Planned",
  "In Progress",
  "Done",
  "On Hold",
];

export const ROADMAP_TEAM_OPTIONS = ["Hosts", "Customers"] as const;
export type RoadmapTeam = typeof ROADMAP_TEAM_OPTIONS[number];

export interface RoadmapComment {
  id: string;
  author: string;
  text: string;
  createdAt: string; // ISO string
}

// A secondary bar / workstream on the same Gantt row (e.g. "Web", "V2").
export interface RoadmapSubBar {
  id: string;
  label: string;
  startUnit: number | null;
  endUnit: number | null;
  description?: string;       // workstream-specific description
  northStarMetric?: string;   // workstream-specific north star metric
  successMetrics?: string;    // how this workstream's success is tracked
}

export interface RoadmapInitiative {
  id: string;
  summary: string;        // group header, e.g. "First booking conversion"
  name: string;           // specific initiative name
  strategyGoal: StrategyGoal | "";
  status: RoadmapStatus;
  description: string;
  owner: string;
  team: RoadmapTeam | "";
  quarter: string;        // start quarter, e.g. "Q3 2026"
  endQuarter: string;     // end quarter (inclusive); empty = same as quarter
  // Fine-grained timeline position in half-months from the timeline anchor
  // (Q3 2026 month 0 = unit 0; 1 month = 2 units; 1 quarter = 6 units).
  // startUnit inclusive, endUnit exclusive. null = derive from quarter/endQuarter.
  startUnit: number | null;
  endUnit: number | null;
  // The initiative's own bar is itself a workstream. Its label/description/metrics
  // are independent of the initiative-level description/metrics below.
  mainBarLabel: string;          // empty = fall back to `name`
  mainBarDescription: string;
  mainBarNorthStarMetric: string;
  mainBarSuccessMetrics: string;
  // Additional bars on the same row (e.g. separate App / Web timelines or V2, V3).
  subBars: RoadmapSubBar[];
  northStarMetric: string;   // single headline metric this initiative moves
  successMetrics: string;    // how we'll track success (comma-separated or prose)
  notes: string;
  comments: RoadmapComment[];
  order: number;
}

function cfg() {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey || !baseId) {
    throw new Error("Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID");
  }
  const table = process.env.AIRTABLE_ROADMAP_TABLE || "Product Roadmap";
  return { apiKey, baseId, table };
}

function headers(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function toRoadmapInitiative(rec: any): RoadmapInitiative {
  const f = rec.fields || {};
  return {
    id: rec.id,
    summary: f["Summary"] || "",
    name: f["Name"] || "",
    strategyGoal: (f["Strategy Goal"] as StrategyGoal) || "",
    status: (f["Status"] as RoadmapStatus) || "Planned",
    description: f["Description"] || "",
    owner: f["Owner"] || "",
    quarter: f["Quarter"] || "",
    endQuarter: f["End Quarter"] || "",
    startUnit: typeof f["Start Unit"] === "number" ? f["Start Unit"] : null,
    endUnit: typeof f["End Unit"] === "number" ? f["End Unit"] : null,
    team: (f["Team"] as RoadmapTeam) || "",
    mainBarLabel: f["Main Bar Label"] || "",
    mainBarDescription: f["Main Bar Description"] || "",
    mainBarNorthStarMetric: f["Main Bar North Star Metric"] || "",
    mainBarSuccessMetrics: f["Main Bar Success Metrics"] || "",
    subBars: (() => {
      try { return f["Sub Bars"] ? JSON.parse(f["Sub Bars"]) : []; }
      catch { return []; }
    })(),
    northStarMetric: f["North Star Metric"] || "",
    successMetrics: f["Success Metrics"] || "",
    notes: f["Notes"] || "",
    comments: (() => {
      try { return f["Comments"] ? JSON.parse(f["Comments"]) : []; }
      catch { return []; }
    })(),
    order: typeof f["Order"] === "number" ? f["Order"] : 999,
  };
}

function toFields(input: Partial<RoadmapInitiative>): Record<string, any> {
  const f: Record<string, any> = {};
  if (input.summary !== undefined) f["Summary"] = input.summary;
  if (input.name !== undefined) f["Name"] = input.name;
  if (input.strategyGoal !== undefined) f["Strategy Goal"] = input.strategyGoal || null;
  if (input.status !== undefined) f["Status"] = input.status;
  if (input.description !== undefined) f["Description"] = input.description;
  if (input.owner !== undefined) f["Owner"] = input.owner;
  if (input.team !== undefined) f["Team"] = input.team || null;
  if (input.quarter !== undefined) f["Quarter"] = input.quarter;
  if (input.endQuarter !== undefined) f["End Quarter"] = input.endQuarter || null;
  if (input.startUnit !== undefined) f["Start Unit"] = input.startUnit;
  if (input.endUnit !== undefined) f["End Unit"] = input.endUnit;
  if (input.mainBarLabel !== undefined) f["Main Bar Label"] = input.mainBarLabel;
  if (input.mainBarDescription !== undefined) f["Main Bar Description"] = input.mainBarDescription;
  if (input.mainBarNorthStarMetric !== undefined) f["Main Bar North Star Metric"] = input.mainBarNorthStarMetric;
  if (input.mainBarSuccessMetrics !== undefined) f["Main Bar Success Metrics"] = input.mainBarSuccessMetrics;
  if (input.subBars !== undefined) f["Sub Bars"] = JSON.stringify(input.subBars);
  if (input.northStarMetric !== undefined) f["North Star Metric"] = input.northStarMetric;
  if (input.successMetrics !== undefined) f["Success Metrics"] = input.successMetrics;
  if (input.notes !== undefined) f["Notes"] = input.notes;
  if (input.comments !== undefined) f["Comments"] = JSON.stringify(input.comments);
  if (input.order !== undefined) f["Order"] = input.order;
  return f;
}

export async function listRoadmapInitiatives(): Promise<RoadmapInitiative[]> {
  const { apiKey, baseId, table } = cfg();
  const records: any[] = [];
  let offset: string | undefined;
  do {
    const url = new URL(`${API_BASE}/${baseId}/${encodeURIComponent(table)}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    const res = await fetch(url.toString(), {
      headers: headers(apiKey),
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Airtable roadmap list failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    records.push(...(data.records || []));
    offset = data.offset;
  } while (offset);

  return records
    .map(toRoadmapInitiative)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export async function createRoadmapInitiative(
  input: Partial<RoadmapInitiative>
): Promise<RoadmapInitiative> {
  const { apiKey, baseId, table } = cfg();
  const res = await fetch(`${API_BASE}/${baseId}/${encodeURIComponent(table)}`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({ fields: toFields(input), typecast: true }),
  });
  if (!res.ok) {
    throw new Error(`Airtable roadmap create failed: ${res.status} ${await res.text()}`);
  }
  return toRoadmapInitiative(await res.json());
}

export async function updateRoadmapInitiative(
  id: string,
  input: Partial<RoadmapInitiative>
): Promise<RoadmapInitiative> {
  const { apiKey, baseId, table } = cfg();
  const res = await fetch(`${API_BASE}/${baseId}/${encodeURIComponent(table)}/${id}`, {
    method: "PATCH",
    headers: headers(apiKey),
    body: JSON.stringify({ fields: toFields(input), typecast: true }),
  });
  if (!res.ok) {
    throw new Error(`Airtable roadmap update failed: ${res.status} ${await res.text()}`);
  }
  return toRoadmapInitiative(await res.json());
}

export async function deleteRoadmapInitiative(id: string): Promise<void> {
  const { apiKey, baseId, table } = cfg();
  const res = await fetch(`${API_BASE}/${baseId}/${encodeURIComponent(table)}/${id}`, {
    method: "DELETE",
    headers: headers(apiKey),
  });
  if (!res.ok) {
    throw new Error(`Airtable roadmap delete failed: ${res.status} ${await res.text()}`);
  }
}
