// People (assignee) directory — backs the assignee dropdowns and the
// GitHub-login → display-name mapping used when prefilling from an issue.
//
// Stored in a dedicated Airtable "People" table so a newly-typed name persists
// as a real record and shows up in the dropdown everywhere.

const API_BASE = "https://api.airtable.com/v0";

export interface Person {
  id: string;
  name: string;
  githubLogin: string;
  colour: string; // named colour from the People table (e.g. "Indigo"), or ""
}

function cfg() {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const table = process.env.AIRTABLE_PEOPLE_TABLE || "People";
  if (!apiKey || !baseId) {
    throw new Error("Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID environment variables.");
  }
  return { apiKey, baseId, table };
}

function authHeaders(apiKey: string) {
  return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
}

export async function listPeople(): Promise<Person[]> {
  const { apiKey, baseId, table } = cfg();
  const people: Person[] = [];
  let offset: string | undefined;
  do {
    const url = new URL(`${API_BASE}/${baseId}/${encodeURIComponent(table)}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    const res = await fetch(url.toString(), { headers: authHeaders(apiKey), cache: "no-store" });
    if (!res.ok) throw new Error(`Airtable people list failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    for (const rec of data.records || []) {
      const f = rec.fields || {};
      if (!f["Name"]) continue;
      people.push({
        id: rec.id,
        name: f["Name"],
        githubLogin: f["GitHub Login"] || "",
        colour: f["Colour"] || "",
      });
    }
    offset = data.offset;
  } while (offset);

  return people.sort((a, b) => a.name.localeCompare(b.name));
}

// Add a new person if one with the same (case-insensitive) name doesn't already
// exist. Returns the person (existing or newly created).
export async function addPerson(name: string, githubLogin = ""): Promise<Person> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required.");

  const existing = await listPeople();
  const match = existing.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
  if (match) return match;

  const { apiKey, baseId, table } = cfg();
  const res = await fetch(`${API_BASE}/${baseId}/${encodeURIComponent(table)}`, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify({
      fields: { Name: trimmed, ...(githubLogin ? { "GitHub Login": githubLogin } : {}) },
      typecast: true,
    }),
  });
  if (!res.ok) throw new Error(`Airtable person create failed: ${res.status} ${await res.text()}`);
  const rec = await res.json();
  const f = rec.fields || {};
  return { id: rec.id, name: f["Name"], githubLogin: f["GitHub Login"] || "", colour: f["Colour"] || "" };
}

// Map of githubLogin (lowercased) -> display name, for prefill resolution.
export async function githubLoginMap(): Promise<Record<string, string>> {
  const people = await listPeople();
  const map: Record<string, string> = {};
  for (const p of people) {
    if (p.githubLogin) map[p.githubLogin.toLowerCase()] = p.name;
  }
  return map;
}

// Build a name(lowercased) -> named colour map for the People who have a colour
// assigned. The client turns the named colour into a full swatch.
export async function colourMap(): Promise<Record<string, string>> {
  const people = await listPeople();
  const map: Record<string, string> = {};
  for (const p of people) {
    if (p.colour) map[p.name.toLowerCase()] = p.colour;
  }
  return map;
}
