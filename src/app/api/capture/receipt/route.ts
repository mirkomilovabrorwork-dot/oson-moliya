import { NextRequest } from "next/server";
import { TxType } from "@prisma/client";
import { getSessionUser } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/http/origin";
import { extractReceipt } from "@/lib/claude/receipt";
import {
  createTransaction,
  findTransactionByCaptureId,
  isUniqueCaptureIdViolation,
} from "@/lib/services/transactions";
import { resolveOrCreateCategory } from "@/lib/services/categories";
import { ensureDefaultAccount } from "@/lib/services/accounts";
import { serializeBigInt } from "@/lib/serialize";
import { db } from "@/lib/db";
import { getRates } from "@/lib/rates";
import { deriveTxAmountFields } from "@/lib/currency";

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

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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

  const image = form.get("image");
  if (!(image instanceof Blob)) {
    return Response.json({ ok: false, error: "missing_image" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(image.type)) {
    return Response.json({ ok: false, error: "unsupported_type" }, { status: 400 });
  }
  if (image.size === 0) {
    return Response.json({ ok: false, error: "empty_image" }, { status: 400 });
  }
  if (image.size > MAX_BYTES) {
    return Response.json({ ok: false, error: "image_too_large" }, { status: 400 });
  }

  const captureIdField = form.get("captureId");
  const captureId = typeof captureIdField === "string" && captureIdField.length > 0 ? captureIdField : null;

  if (captureId) {
    const existing = await findTransactionByCaptureId(user.id, captureId);
    if (existing) {
      // Already saved (a retry after a lost response) — return the original
      // success response instead of re-running vision.
      return Response.json({
        ok: true,
        saved: true,
        transaction: serializeBigInt(existing),
        extracted: {
          found: true,
          amount: existing.originalAmount != null ? Number(existing.originalAmount) : Number(existing.amountUzs),
          currency: existing.originalCurrency ?? "UZS",
          category: existing.category?.name ?? null,
          note: existing.note,
        },
      });
    }
  }

  const buffer = Buffer.from(await image.arrayBuffer());
  const imageBase64 = buffer.toString("base64");

  const prisma = db as import("@prisma/client").PrismaClient;
  const categories = await prisma.category.findMany({
    where: { userId: user.id },
    select: { name: true },
  });

  const extracted = await extractReceipt(imageBase64, image.type, {
    categoryNames: categories.map((c) => c.name),
    lang: user.language,
  });

  if (extracted.found && typeof extracted.amount === "number" && extracted.amount > 0) {
    const rates = await getRates();
    const { amountUzs, originalCurrency, originalAmount } = deriveTxAmountFields(
      extracted.amount,
      extracted.currency,
      rates
    );

    let categoryId: string | null = null;
    if (extracted.category) {
      categoryId = await resolveOrCreateCategory(user.id, extracted.category, TxType.expense);
    }
    let defaultAccountId: string | null = null;
    try {
      defaultAccountId = await ensureDefaultAccount(user.id);
    } catch {
      // Default account seeding must never block transaction logging
    }

    let tx;
    try {
      tx = await createTransaction({
        userId: user.id,
        categoryId,
        accountId: defaultAccountId,
        type: TxType.expense,
        amountUzs,
        originalCurrency,
        originalAmount,
        note: extracted.note ?? null,
        occurredAt: new Date(),
        source: "app",
        captureId,
      });
    } catch (err) {
      if (captureId && isUniqueCaptureIdViolation(err)) {
        const existing = await findTransactionByCaptureId(user.id, captureId);
        if (existing) {
          return Response.json({
            ok: true,
            saved: true,
            transaction: serializeBigInt(existing),
            extracted,
          });
        }
      }
      throw err;
    }
    return Response.json({
      ok: true,
      saved: true,
      transaction: serializeBigInt(tx),
      extracted,
    });
  }

  return Response.json({ ok: true, saved: false, extracted });
}
