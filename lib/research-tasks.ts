// ── Airtable "Research Roadmap" table — fields ────────────────────────────────
// A deliberately simpler sibling of the Product Roadmap: one flat list of
// individual research tasks placed on the same quarterly Gantt timeline.
//
//  Name          (Single line text)   — research task name
//  Assignee      (Single line text)   — one of RESEARCH_ASSIGNEE_OPTIONS
//  Status        (Single select)      — Planned | In Progress | Done | On Hold
//  Quarter       (Single select)      — Q3 2026 … Q4 2027 (start quarter)
//  End Quarter   (Single select)      — Q3 2026 … Q4 2027 (inclusive)
//  Start Unit    (Number)             — fine-grained week offset from anchor
//  End Unit      (Number)             — fine-grained week offset (exclusive)
//  Notes         (Long text)
//  Order         (Number)             — sort order in the list
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = "https://api.airtable.com/v0";

export type ResearchStatus = "Planned" | "In Progress" | "Done" | "On Hold";

export const RESEARCH_STATUS_OPTIONS: ResearchStatus[] = [
  "Planned",
  "In Progress",
  "Done",
  "On Hold",
];

// Who can be assigned a research task. A fixed list rather than the People
// table, which covers the whole company — only these six do research.
export const RESEARCH_ASSIGNEE_OPTIONS = [
  "Oski",
  "Pedro",
  "Emily",
  "Amit",
  "JB",
  "Luke",
] as const;

export type ResearchAssignee = typeof RESEARCH_ASSIGNEE_OPTIONS[number];

export interface ResearchTask {
  id: string;
  name: string;
  assignee: string;      // one of RESEARCH_ASSIGNEE_OPTIONS, or "" if unassigned
  status: ResearchStatus;
  quarter: string;       // start quarter, e.g. "Q3 2026"
  endQuarter: string;    // end quarter (inclusive); empty = same as quarter
  // Fine-grained timeline position in week units from the timeline anchor
  // (Q3 2026 month 0 = unit 0; 1 month = 4 units; 1 quarter = 12 units).
  // startUnit inclusive, endUnit exclusive. null = derive from quarter fields.
  startUnit: number | null;
  endUnit: number | null;
  notes: string;
  order: number;
}

function cfg() {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey || !baseId) {
    throw new Error("Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID");
  }
  const table = process.env.AIRTABLE_RESEARCH_TABLE || "Research Roadmap";
  return { apiKey, baseId, table };
}

function headers(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function toResearchTask(rec: any): ResearchTask {
  const f = rec.fields || {};
  return {
    id: rec.id,
    name: f["Name"] || "",
    assignee: f["Assignee"] || "",
    status: (f["Status"] as ResearchStatus) || "Planned",
    quarter: f["Quarter"] || "",
    endQuarter: f["End Quarter"] || "",
    startUnit: typeof f["Start Unit"] === "number" ? f["Start Unit"] : null,
    endUnit: typeof f["End Unit"] === "number" ? f["End Unit"] : null,
    notes: f["Notes"] || "",
    order: typeof f["Order"] === "number" ? f["Order"] : 999,
  };
}

function toFields(input: Partial<ResearchTask>): Record<string, any> {
  const f: Record<string, any> = {};
  if (input.name !== undefined) f["Name"] = input.name;
  if (input.assignee !== undefined) f["Assignee"] = input.assignee;
  if (input.status !== undefined) f["Status"] = input.status;
  if (input.quarter !== undefined) f["Quarter"] = input.quarter || null;
  if (input.endQuarter !== undefined) f["End Quarter"] = input.endQuarter || null;
  if (input.startUnit !== undefined) f["Start Unit"] = input.startUnit;
  if (input.endUnit !== undefined) f["End Unit"] = input.endUnit;
  if (input.notes !== undefined) f["Notes"] = input.notes;
  if (input.order !== undefined) f["Order"] = input.order;
  return f;
}

export async function listResearchTasks(): Promise<ResearchTask[]> {
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
      throw new Error(`Airtable research list failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    records.push(...(data.records || []));
    offset = data.offset;
  } while (offset);

  return records
    .map(toResearchTask)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export async function createResearchTask(
  input: Partial<ResearchTask>
): Promise<ResearchTask> {
  const { apiKey, baseId, table } = cfg();
  const res = await fetch(`${API_BASE}/${baseId}/${encodeURIComponent(table)}`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({ fields: toFields(input), typecast: true }),
  });
  if (!res.ok) {
    throw new Error(`Airtable research create failed: ${res.status} ${await res.text()}`);
  }
  return toResearchTask(await res.json());
}

export async function updateResearchTask(
  id: string,
  input: Partial<ResearchTask>
): Promise<ResearchTask> {
  const { apiKey, baseId, table } = cfg();
  const res = await fetch(`${API_BASE}/${baseId}/${encodeURIComponent(table)}/${id}`, {
    method: "PATCH",
    headers: headers(apiKey),
    body: JSON.stringify({ fields: toFields(input), typecast: true }),
  });
  if (!res.ok) {
    throw new Error(`Airtable research update failed: ${res.status} ${await res.text()}`);
  }
  return toResearchTask(await res.json());
}

export async function deleteResearchTask(id: string): Promise<void> {
  const { apiKey, baseId, table } = cfg();
  const res = await fetch(`${API_BASE}/${baseId}/${encodeURIComponent(table)}/${id}`, {
    method: "DELETE",
    headers: headers(apiKey),
  });
  if (!res.ok) {
    throw new Error(`Airtable research delete failed: ${res.status} ${await res.text()}`);
  }
}
