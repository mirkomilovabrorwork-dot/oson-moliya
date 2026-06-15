/**
 * POST /api/import/commit
 *
 * Bulk-create the confirmed import transactions.
 * Accepts the transactions the user reviewed (possibly a subset of the parse
 * result), plus the target accountId.
 *
 * source="import" — additive only, never deletes.
 * Idempotency: within the submitted batch, duplicate rows (same date+amount+type)
 * are deduplicated before insertion to prevent double-submit on retry.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { TxType } from "@prisma/client";
import { getSessionUser } from "@/lib/auth/session";
import { createTransaction } from "@/lib/services/transactions";
import { resolveOrCreateCategory } from "@/lib/services/categories";
import { assertSameOrigin } from "@/lib/http/origin";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// ── Single confirmed transaction ──────────────────────────────────────────────
const ConfirmedTxSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amountUzs: z.number().int().positive(),
  type: z.enum(["income", "expense"]),
  category: z.string().max(100),
  note: z.string().max(300),
  originalCurrency: z.string().max(10).nullable().optional(),
  originalAmount: z.number().positive().nullable().optional(),
});

// ── Request body ──────────────────────────────────────────────────────────────
const BodySchema = z.object({
  transactions: z
    .array(ConfirmedTxSchema)
    .min(1)
    .max(150),
  accountId: z.string().min(1),
});

export async function POST(request: NextRequest): Promise<Response> {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.format() },
      { status: 422 }
    );
  }

  const { transactions, accountId } = parsed.data;

  // Validate accountId belongs to this user
  const prisma = db as import("@prisma/client").PrismaClient;
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId: user.id },
    select: { id: true },
  });
  if (!account) {
    return Response.json({ error: "Account not found" }, { status: 422 });
  }

  // Deduplicate within the submitted batch (same date+amountUzs+type)
  const seen = new Set<string>();
  const unique = transactions.filter((tx) => {
    const key = `${tx.date}|${tx.amountUzs}|${tx.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Bulk-create
  let created = 0;
  const errors: string[] = [];

  for (const tx of unique) {
    try {
      const txType = tx.type === "income" ? TxType.income : TxType.expense;
      const categoryId = await resolveOrCreateCategory(user.id, tx.category, txType);

      await createTransaction({
        userId: user.id,
        categoryId,
        accountId: account.id,
        type: txType,
        amountUzs: BigInt(tx.amountUzs),
        originalCurrency: tx.originalCurrency ?? null,
        originalAmount:
          tx.originalAmount != null
            ? BigInt(Math.round(tx.originalAmount))
            : null,
        note: tx.note || null,
        occurredAt: new Date(tx.date),
        source: "import",
      });
      created++;
    } catch (err) {
      console.error("[import/commit] row error:", err);
      errors.push(
        err instanceof Error ? err.message : "Unknown error"
      );
    }
  }

  return Response.json(
    { created, skipped: unique.length - created, errors: errors.slice(0, 5) },
    { status: 201 }
  );
}
