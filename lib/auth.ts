// Domain allowlist for sign-in. Only Google accounts on these domains may use
// the app. Enforced in middleware (the source of truth) and re-checked on the
// not-allowed page. Optionally mirror this list in the Clerk Dashboard
// (Restrictions → Allowlist) as an additional first gate.
export const ALLOWED_EMAIL_DOMAINS = [
  "stasher.com",
  "citystasher.com",
  "stasher.co.uk",
  "citystasher.co.uk",
];

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const at = email.lastIndexOf("@");
  if (at === -1) return false;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return ALLOWED_EMAIL_DOMAINS.includes(domain);
}

const EDITORS_TABLE = "tblddFtP1kUnxXWMp";
const EMAIL_FIELD = "fldxGeRy4fYKBjgj3";
const NAME_FIELD = "fldsLMhgAmUksTV7g";

export interface EditorRecord {
  id: string;
  email: string;
  name: string;
}

function airtableHeaders() {
  return {
    Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
    "Content-Type": "application/json",
  };
}

function editorsUrl(path = "") {
  return `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${EDITORS_TABLE}${path}`;
}

export async function getEditors(): Promise<EditorRecord[]> {
  const res = await fetch(editorsUrl(), {
    headers: airtableHeaders(),
    cache: "no-store",
  });
  if (!res.ok) return [];
  const json = await res.json();
  return (json.records ?? []).map((r: any) => ({
    id: r.id,
    email: (r.fields[EMAIL_FIELD] ?? "").trim().toLowerCase(),
    name: r.fields[NAME_FIELD] ?? "",
  }));
}

export async function addEditor(email: string, name = ""): Promise<EditorRecord[]> {
  await fetch(editorsUrl(), {
    method: "POST",
    headers: airtableHeaders(),
    body: JSON.stringify({
      records: [{ fields: { [EMAIL_FIELD]: email.trim().toLowerCase(), [NAME_FIELD]: name } }],
    }),
  });
  return getEditors();
}

export async function removeEditor(recordId: string): Promise<EditorRecord[]> {
  await fetch(editorsUrl(`/${recordId}`), {
    method: "DELETE",
    headers: airtableHeaders(),
  });
  return getEditors();
}

export async function isEditorEmail(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const editors = await getEditors();
  return editors.some((e) => e.email === email.trim().toLowerCase());
}
