import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "pultrack_session";

// Next.js 16: the `proxy` file convention replaces the deprecated `middleware`.
// Edge-safe: only checks cookie PRESENCE (no DB, no globals). Full session
// validation happens in getSessionUser() inside route handlers / server components.
function hasSessionCookie(request: NextRequest): boolean {
  return !!request.cookies.get(COOKIE_NAME)?.value;
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Always allow: Telegram webhook, auth endpoints, login/onboarding, static assets.
  if (
    pathname.startsWith("/api/telegram") ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  // Protect dashboard pages.
  const isDashboardPath =
    pathname === "/" ||
    pathname.startsWith("/transactions") ||
    pathname.startsWith("/analytics") ||
    pathname.startsWith("/categories");

  if (isDashboardPath && !hasSessionCookie(request)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Protect mutating/data API routes.
  const isProtectedApi =
    pathname.startsWith("/api/transactions") ||
    pathname.startsWith("/api/categories") ||
    pathname.startsWith("/api/budgets");

  if (isProtectedApi && !hasSessionCookie(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
