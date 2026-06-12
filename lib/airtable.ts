import { Initiative } from "./types";

const API_BASE = "https://api.airtable.com/v0";

function cfg() {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const table = process.env.AIRTABLE_TABLE_NAME || "Initiatives";
  if (!apiKey || !baseId) {
    throw new Error(
      "Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID environment variables."
    );
  }
  return { apiKey, baseId, table };
}

// All extended fields are now live in the Airtable base.
// Set AIRTABLE_EXTENDED_FIELDS=false to disable writing them (emergency rollback only).
function extendedFields() {
  return process.env.AIRTABLE_EXTENDED_FIELDS !== "false";
}

function authHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function toInitiative(rec: any): Initiative {
  const f = rec.fields || {};
  return {
    id: rec.id,
    name: f["Name"] || "",
    description: f["Description"] || "",
    team: f["Team"] || "",
    area: f["Area"] || "",
    pod: f["Pod"] || "",
    spansPods: Boolean(f["Spans Pods"]),
    timeframe: (f["Timeframe"] as Initiative["timeframe"]) || "Future",
    status: (f["Status"] as Initiative["status"]) || "To Do",
    primaryAssignees: f["Primary Assignees"] || "",
    supportAssignees: f["Support Assignees"] || "",
    link: f["Link"] || "",
    notes: f["Notes"] || "",
    order: typeof f["Order"] === "number" ? f["Order"] : 999,
    tShirtSize: f["T-Shirt Size"] || "",
    durationWeeks: typeof f["Duration Weeks"] === "number" ? f["Duration Weeks"] : 1,
    tags: Array.isArray(f["Tags"]) ? f["Tags"] : [],
    comments: (() => {
      try { return f["Comments"] ? JSON.parse(f["Comments"]) : []; }
      catch { return []; }
    })(),
    layers: Array.isArray(f["Layers"]) ? f["Layers"] : [],
    completedDate: f["Completed Date"] || "",
    priority: f["Priority"] || "",
  };
}

function toFields(input: Partial<Initiative>): Record<string, any> {
  const f: Record<string, any> = {};
  // Core fields — always exist in the base
  if (input.name !== undefined) f["Name"] = input.name;
  if (input.description !== undefined) f["Description"] = input.description;
  if (input.team !== undefined) f["Team"] = input.team || null;
  if (input.area !== undefined) f["Area"] = input.area || null;
  if (input.pod !== undefined) f["Pod"] = input.pod || null;
  if (input.spansPods !== undefined) f["Spans Pods"] = Boolean(input.spansPods);
  if (input.timeframe !== undefined) f["Timeframe"] = input.timeframe || null;
  if (input.status !== undefined) f["Status"] = input.status || null;
  if (input.link !== undefined) f["Link"] = input.link;
  if (input.notes !== undefined) f["Notes"] = input.notes;
  if (input.order !== undefined) f["Order"] = input.order;

  // Extended fields — only written after you add them in Airtable
  if (extendedFields()) {
    if (input.primaryAssignees !== undefined) f["Primary Assignees"] = input.primaryAssignees;
    if (input.supportAssignees !== undefined) f["Support Assignees"] = input.supportAssignees;
    if (input.tShirtSize !== undefined) f["T-Shirt Size"] = input.tShirtSize || null;
    if (input.durationWeeks !== undefined) f["Duration Weeks"] = input.durationWeeks;
    if (input.tags !== undefined) f["Tags"] = input.tags;
    if (input.comments !== undefined) f["Comments"] = JSON.stringify(input.comments);
    if (input.layers !== undefined) f["Layers"] = input.layers;
    if (input.completedDate !== undefined) f["Completed Date"] = input.completedDate || null;
    if (input.priority !== undefined) f["Priority"] = input.priority || null;
  }
  return f;
}

export async function listInitiatives(): Promise<Initiative[]> {
  const { apiKey, baseId, table } = cfg();
  const records: any[] = [];
  let offset: string | undefined;
  do {
    const url = new URL(`${API_BASE}/${baseId}/${encodeURIComponent(table)}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    const res = await fetch(url.toString(), {
      headers: authHeaders(apiKey),
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Airtable list failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    records.push(...(data.records || []));
    offset = data.offset;
  } while (offset);

  return records
    .map(toInitiative)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export async function createInitiative(
  input: Partial<Initiative>
): Promise<Initiative> {
  const { apiKey, baseId, table } = cfg();
  const res = await fetch(`${API_BASE}/${baseId}/${encodeURIComponent(table)}`, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify({ fields: toFields(input), typecast: true }),
  });
  if (!res.ok) {
    throw new Error(`Airtable create failed: ${res.status} ${await res.text()}`);
  }
  return toInitiative(await res.json());
}

export async function updateInitiative(
  id: string,
  input: Partial<Initiative>
): Promise<Initiative> {
  const { apiKey, baseId, table } = cfg();
  const res = await fetch(
    `${API_BASE}/${baseId}/${encodeURIComponent(table)}/${id}`,
    {
      method: "PATCH",
      headers: authHeaders(apiKey),
      body: JSON.stringify({ fields: toFields(input), typecast: true }),
    }
  );
  if (!res.ok) {
    throw new Error(`Airtable update failed: ${res.status} ${await res.text()}`);
  }
  return toInitiative(await res.json());
}

export async function deleteInitiative(id: string): Promise<void> {
  const { apiKey, baseId, table } = cfg();
  const res = await fetch(
    `${API_BASE}/${baseId}/${encodeURIComponent(table)}/${id}`,
    { method: "DELETE", headers: authHeaders(apiKey) }
  );
  if (!res.ok) {
    throw new Error(`Airtable delete failed: ${res.status} ${await res.text()}`);
  }
}
