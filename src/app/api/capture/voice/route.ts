import { NextRequest } from "next/server";
import { TxType } from "@prisma/client";
import { getSessionUser } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/http/origin";
import { getSttProvider } from "@/lib/stt";
import { runBrain } from "@/lib/claude/brain";
import {
  createTransaction,
  findTransactionByCaptureId,
  isUniqueCaptureIdViolation,
} from "@/lib/services/transactions";
import { resolveOrCreateCategory } from "@/lib/services/categories";
import { serializeBigInt } from "@/lib/serialize";
import { db } from "@/lib/db";
import { filenameForAudioMime } from "@/lib/capture/audio-filename";
import { dateStringToUtc } from "@/lib/capture/occurred-at";
import { ensureDefaultAccount } from "@/lib/services/accounts";

export const dynamic = "force-dynamic";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 20;
const MAX_BYTES = 10 * 1024 * 1024;

type RateEntry = { count: number; resetAt: number };
const attempts = new Map<string, RateEntry>();

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const current = attempts.get(userId);
  if (!current || current.resetAt <= now) {
    attempts.set(userId, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  attempts.set(userId, current);
  return current.count > MAX_REQUESTS;
}

const LANGUAGES = new Set(["uz", "ru", "en"]);

export async function POST(request: NextRequest): Promise<Response> {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isRateLimited(user.id)) {
    return Response.json({ ok: false, error: "too_many_attempts" }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ ok: false, error: "invalid_form" }, { status: 400 });
  }

  const audio = form.get("audio");
  if (!(audio instanceof Blob)) {
    return Response.json({ ok: false, error: "missing_audio" }, { status: 400 });
  }
  if (audio.size === 0) {
    return Response.json({ ok: false, error: "empty_audio" }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) {
    return Response.json({ ok: false, error: "audio_too_large" }, { status: 400 });
  }

  const captureIdField = form.get("captureId");
  const captureId = typeof captureIdField === "string" && captureIdField.length > 0 ? captureIdField : null;

  if (captureId) {
    const existing = await findTransactionByCaptureId(user.id, captureId);
    if (existing) {
      // Already saved (a retry after a lost response) — return the original
      // success response instead of transcribing/re-saving.
      return Response.json({
        ok: true,
        saved: true,
        transcript: existing.note ?? "",
        transaction: serializeBigInt(existing),
      });
    }
  }

  const languageField = form.get("language");
  const language =
    typeof languageField === "string" && LANGUAGES.has(languageField)
      ? languageField
      : user.language;

  const filename = filenameForAudioMime(audio.type);
  const buffer = Buffer.from(await audio.arrayBuffer());

  let transcript: string;
  try {
    transcript = await getSttProvider().transcribe(buffer, filename, { language });
  } catch (err) {
    console.error("[capture/voice] transcription failed", err);
    return Response.json({ ok: false, error: "stt_failed" }, { status: 502 });
  }

  let intent;
  try {
    const prisma = db as import("@prisma/client").PrismaClient;
    const categories = await prisma.category.findMany({
      where: { userId: user.id },
      select: { name: true },
    });
    const result = await runBrain({
      text: transcript,
      user: { id: user.id, language: user.language },
      pending: null,
      categoryNames: categories.map((c) => c.name),
    });
    intent = result.intent;
  } catch (err) {
    console.error("[capture/voice] brain failed", err);
    return Response.json({ ok: false, error: "brain_failed" }, { status: 502 });
  }

  const isLog = intent.intent === "log_income" || intent.intent === "log_expense";
  if (isLog && typeof intent.amount === "number" && intent.amount > 0) {
    const txType = intent.intent === "log_income" ? TxType.income : TxType.expense;
    let categoryId: string | null = null;
    if (intent.category) {
      categoryId = await resolveOrCreateCategory(user.id, intent.category, txType);
    }
    let defaultAccountId: string | null = null;
    try {
      defaultAccountId = await ensureDefaultAccount(user.id);
    } catch {
      // Default account seeding must never block transaction logging
    }

    const intentAny = intent as Record<string, unknown>;
    const originalAmount = (intentAny._originalAmount as number | undefined) ?? null;
    const originalCurrency = (intentAny._originalCurrency as string | undefined) ?? null;

    let tx;
    try {
      tx = await createTransaction({
        userId: user.id,
        categoryId,
        accountId: defaultAccountId,
        type: txType,
        amountUzs: BigInt(Math.round(intent.amount)),
        originalCurrency:
          originalCurrency && originalCurrency !== "UZS" ? originalCurrency : null,
        originalAmount:
          originalCurrency && originalCurrency !== "UZS" && originalAmount != null
            ? BigInt(Math.round(originalAmount))
            : null,
        note: intent.note ?? null,
        occurredAt: dateStringToUtc(intent.date ?? "today"),
        source: "app",
        captureId,
      });
    } catch (err) {
      // Unique-constraint hit on captureId — a concurrent retry already saved
      // it; return that row instead of a 500.
      if (captureId && isUniqueCaptureIdViolation(err)) {
        const existing = await findTransactionByCaptureId(user.id, captureId);
        if (existing) {
          return Response.json({
            ok: true,
            saved: true,
            transcript,
            transaction: serializeBigInt(existing),
          });
        }
      }
      throw err;
    }
    return Response.json({
      ok: true,
      saved: true,
      transcript,
      transaction: serializeBigInt(tx),
    });
  }

  return Response.json({
    ok: true,
    saved: false,
    transcript,
    intent,
    question: intent.intent === "clarify_needed" ? intent.reply_text : null,
  });
}
