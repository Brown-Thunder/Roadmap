import { clerkMiddleware, createRouteMatcher, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { handleClerkProxy } from "@/lib/clerk-proxy";
import { isAllowedEmail } from "@/lib/auth";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/sso-callback(.*)",
  "/not-allowed(.*)",
  "/api/og(.*)",   // Slack/unfurl fetches this image server-side (no session)
]);

const isCronRoute = createRouteMatcher(["/api/cron/(.*)"]);

const authMiddleware = clerkMiddleware(async (auth, req) => {
  // Vercel Cron authenticates with CRON_SECRET in the route handler.
  if (isCronRoute(req)) return;

  if (isPublicRoute(req)) return;

  // Require a signed-in user.
  const { userId, sessionClaims } = await auth.protect();

  // Enforce the email-domain allowlist. Prefer the email from session claims
  // (add an "email" claim in Clerk → Sessions to skip the lookup); otherwise
  // fall back to fetching the user record.
  let email = (sessionClaims as { email?: string } | null)?.email ?? null;
  if (!email && userId) {
    try {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      email =
        user.primaryEmailAddress?.emailAddress ??
        user.emailAddresses[0]?.emailAddress ??
        null;
    } catch {
      email = null;
    }
  }

  if (!isAllowedEmail(email)) {
    const url = req.nextUrl.clone();
    url.pathname = "/not-allowed";
    url.search = "";
    return NextResponse.redirect(url);
  }
});

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  const proxy = handleClerkProxy(request);
  if (proxy) return proxy;
  return authMiddleware(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
