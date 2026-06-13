import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { ensureDefaultCategories } from "@/lib/services/categories";
import {
  validateTelegramInitData,
  TelegramInitDataError,
} from "@/lib/auth/telegram-init-data";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/telegram
 *
 * Body: { initData: string }  — the raw window.Telegram.WebApp.initData string.
 *
 * Validates the initData HMAC per Telegram's algorithm, upserts the User,
 * ensures default categories, and issues a session cookie.
 *
 * Returns 200 { ok: true } on success, 401 on invalid/expired initData.
 */
export async function POST(request: Request): Promise<Response> {
  let initData: string;
  try {
    const body = (await request.json()) as { initData?: unknown };
    if (typeof body.initData !== "string" || !body.initData) {
      return NextResponse.json({ ok: false, error: "missing initData" }, { status: 400 });
    }
    initData = body.initData;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const env = getEnv();

  let telegramUser;
  try {
    telegramUser = validateTelegramInitData(initData, env.TELEGRAM_BOT_TOKEN);
  } catch (err) {
    if (err instanceof TelegramInitDataError) {
      return NextResponse.json(
        { ok: false, error: err.message, code: err.code },
        { status: 401 }
      );
    }
    console.error("Unexpected initData validation error:", err);
    return NextResponse.json({ ok: false, error: "validation error" }, { status: 500 });
  }

  // Upsert user by telegramId (same pattern as bot.ts handleMessage)
  const prisma = db as import("@prisma/client").PrismaClient;
  const user = await prisma.user.upsert({
    where: { telegramId: BigInt(telegramUser.id) },
    create: {
      telegramId: BigInt(telegramUser.id),
      firstName: telegramUser.first_name ?? null,
      username: telegramUser.username ?? null,
      language: telegramUser.language_code === "ru" ? "ru" : "uz",
    },
    update: {
      firstName: telegramUser.first_name ?? null,
      username: telegramUser.username ?? null,
    },
  });

  await ensureDefaultCategories(user.id);
  await createSession(user.id);

  return NextResponse.json({ ok: true });
}
