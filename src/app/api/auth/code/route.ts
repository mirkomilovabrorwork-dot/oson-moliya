import { NextResponse } from "next/server";
import { consumeMagicToken } from "@/lib/auth/token";
import { createSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { ensureDefaultCategories } from "@/lib/services/categories";

export const dynamic = "force-dynamic";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;

type LoginAttempt = {
  count: number;
  resetAt: number;
};

const attempts = new Map<string, LoginAttempt>();

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

export async function POST(request: Request): Promise<Response> {
  if (isRateLimited(request)) {
    return NextResponse.json(
      { ok: false, error: "too_many_attempts" },
      { status: 429 }
    );
  }

  let code = "";
  try {
    const body = (await request.json()) as { code?: unknown };
    code = String(body.code ?? "").replace(/\D/g, "");
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ ok: false, error: "invalid_code" }, { status: 400 });
  }

  const userId = await consumeMagicToken(code);
  if (!userId) {
    return NextResponse.json({ ok: false, error: "invalid_or_expired" }, { status: 401 });
  }

  const prisma = db as import("@prisma/client").PrismaClient;
  await ensureDefaultCategories(userId);
  await createSession(userId);

  const txCount = await prisma.transaction.count({
    where: { userId, deletedAt: null },
  });

  return NextResponse.json({
    ok: true,
    redirectTo: txCount === 0 ? "/onboarding" : "/",
  });
}
