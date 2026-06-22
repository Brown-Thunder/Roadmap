const API_BASE = "https://api.airtable.com/v0";

// Simple key/value settings stored in a dedicated Airtable "Settings" table.
// Currently used for the Product Roadmap publish flag.

function cfg() {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey || !baseId) {
    throw new Error("Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID");
  }
  const table = process.env.AIRTABLE_SETTINGS_TABLE || "Settings";
  return { apiKey, baseId, table };
}

function headers(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

// Returns the raw record (id + value) for a key, or null if it doesn't exist.
async function findSetting(key: string): Promise<{ id: string; value: string } | null> {
  const { apiKey, baseId, table } = cfg();
  const url = new URL(`${API_BASE}/${baseId}/${encodeURIComponent(table)}`);
  url.searchParams.set("filterByFormula", `{Key} = '${key}'`);
  url.searchParams.set("maxRecords", "1");
  const res = await fetch(url.toString(), { headers: headers(apiKey), cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Airtable settings read failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const rec = (data.records || [])[0];
  if (!rec) return null;
  return { id: rec.id, value: rec.fields?.["Value"] ?? "" };
}

export async function getSetting(key: string, fallback = ""): Promise<string> {
  const rec = await findSetting(key);
  return rec ? rec.value : fallback;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const { apiKey, baseId, table } = cfg();
  const existing = await findSetting(key);
  if (existing) {
    const res = await fetch(`${API_BASE}/${baseId}/${encodeURIComponent(table)}/${existing.id}`, {
      method: "PATCH",
      headers: headers(apiKey),
      body: JSON.stringify({ fields: { Value: value } }),
    });
    if (!res.ok) throw new Error(`Airtable settings update failed: ${res.status} ${await res.text()}`);
  } else {
    const res = await fetch(`${API_BASE}/${baseId}/${encodeURIComponent(table)}`, {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify({ fields: { Key: key, Value: value } }),
    });
    if (!res.ok) throw new Error(`Airtable settings create failed: ${res.status} ${await res.text()}`);
  }
}

// ── Roadmap publish flag ──────────────────────────────────────────────────────
const ROADMAP_PUBLISHED_KEY = "roadmap_published";

export async function isRoadmapPublished(): Promise<boolean> {
  const v = await getSetting(ROADMAP_PUBLISHED_KEY, "false");
  return v === "true";
}

export async function setRoadmapPublished(published: boolean): Promise<void> {
  await setSetting(ROADMAP_PUBLISHED_KEY, published ? "true" : "false");
}
