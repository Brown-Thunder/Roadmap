import { NextRequest, NextResponse } from "next/server";

// Forward /__clerk/* to Clerk's Frontend API so clerk-js loads from the
// current origin (localhost or your Vercel domain) instead of a separate
// clerk.* subdomain that may not be configured.
export function handleClerkProxy(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/__clerk")) return null;

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return null;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Clerk-Proxy-Url", `${request.nextUrl.origin}/__clerk`);
  requestHeaders.set("Clerk-Secret-Key", secretKey);
  requestHeaders.set(
    "X-Forwarded-For",
    request.headers.get("x-forwarded-for") ??
      request.headers.get("x-real-ip") ??
      "127.0.0.1"
  );

  const url = request.nextUrl.clone();
  url.protocol = "https:";
  url.hostname = "frontend-api.clerk.dev";
  url.pathname = pathname.replace(/^\/__clerk/, "") || "/";

  return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
}
