import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assertSameOrigin } from "@/lib/http/origin";
import { ensureDefaultCategories } from "@/lib/services/categories";
import { verifyPassword, normalizeLoginName } from "@/lib/auth/password";

export const dynamic = "force-dynamic";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;

const attempts = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  return forwarded || realIp || "local";
}

function isRateLimited(request: Request): boolean {
  const key = clientKey(request);
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  attempts.set(key, current);
  return current.count > MAX_ATTEMPTS;
}

export async function POST(request: NextRequest): Promise<Response> {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  if (isRateLimited(request)) {
    return NextResponse.json({ ok: false, error: "too_many_attempts" }, { status: 429 });
  }

  let body: { loginName?: unknown; password?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const loginName = normalizeLoginName(
    typeof body.loginName === "string" ? body.loginName : ""
  );
  const password = typeof body.password === "string" ? body.password : "";

  const prisma = db as import("@prisma/client").PrismaClient;
  const user = loginName
    ? await prisma.user.findUnique({ where: { loginName } })
    : null;

  // Generic failure for both "no such login" and "wrong password" — no user enumeration.
  const ok = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !ok) {
    return NextResponse.json({ ok: false, error: "invalid_credentials" }, { status: 401 });
  }

  await ensureDefaultCategories(user.id);
  await createSession(user.id);

  const txCount = await prisma.transaction.count({
    where: { userId: user.id, deletedAt: null },
  });

  return NextResponse.json({ ok: true, redirectTo: txCount === 0 ? "/onboarding" : "/" });
}
