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

function authHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

// Map an Airtable record to our Initiative type.
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
    owner: f["Owner"] || "",
    ownerSlackIds: f["Owner Slack IDs"] || "",
    link: f["Link"] || "",
    notes: f["Notes"] || "",
    order: typeof f["Order"] === "number" ? f["Order"] : 999,
  };
}

// Map our Initiative (partial) back to Airtable fields.
function toFields(input: Partial<Initiative>): Record<string, any> {
  const f: Record<string, any> = {};
  if (input.name !== undefined) f["Name"] = input.name;
  if (input.description !== undefined) f["Description"] = input.description;
  if (input.team !== undefined) f["Team"] = input.team || null;
  if (input.area !== undefined) f["Area"] = input.area || null;
  if (input.pod !== undefined) f["Pod"] = input.pod || null;
  if (input.spansPods !== undefined) f["Spans Pods"] = Boolean(input.spansPods);
  if (input.timeframe !== undefined) f["Timeframe"] = input.timeframe || null;
  if (input.status !== undefined) f["Status"] = input.status || null;
  if (input.owner !== undefined) f["Owner"] = input.owner;
  if (input.ownerSlackIds !== undefined) f["Owner Slack IDs"] = input.ownerSlackIds;
  if (input.link !== undefined) f["Link"] = input.link;
  if (input.notes !== undefined) f["Notes"] = input.notes;
  if (input.order !== undefined) f["Order"] = input.order;
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
