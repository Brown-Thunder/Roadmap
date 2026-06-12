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
