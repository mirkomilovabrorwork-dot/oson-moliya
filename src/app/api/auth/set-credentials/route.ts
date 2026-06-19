import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assertSameOrigin } from "@/lib/http/origin";
import {
  hashPassword,
  normalizeLoginName,
  isValidLoginName,
  isValidPassword,
} from "@/lib/auth/password";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { loginName?: unknown; password?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const rawLogin = typeof body.loginName === "string" ? body.loginName : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!isValidLoginName(rawLogin)) {
    return NextResponse.json({ ok: false, error: "invalid_login" }, { status: 422 });
  }
  if (!isValidPassword(password)) {
    return NextResponse.json({ ok: false, error: "invalid_password" }, { status: 422 });
  }

  const loginName = normalizeLoginName(rawLogin);
  const prisma = db as import("@prisma/client").PrismaClient;

  // Uniqueness EXCLUDING self (a user may re-save their own login + new password).
  const existing = await prisma.user.findUnique({ where: { loginName } });
  if (existing && existing.id !== user.id) {
    return NextResponse.json({ ok: false, error: "login_taken" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.update({
    where: { id: user.id },
    data: { loginName, passwordHash },
  });

  return NextResponse.json({ ok: true, loginName });
}
