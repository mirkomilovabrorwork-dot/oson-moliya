import { NextRequest } from "next/server";
import { TxType } from "@prisma/client";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import type { AnalyticsDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns AnalyticsDTO: incomeVsExpense totals, byCategory breakdown, and
 * daily trend buckets — all amounts as strings (BigInt-safe).
 *
 * `from` is inclusive (Tashkent midnight = start of that day).
 * `to`   is exclusive (Tashkent midnight = start of that day).
 * Both dates are parsed as Tashkent-local midnight (UTC-5h offset).
 */
export async function GET(request: NextRequest): Promise<Response> {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = request.nextUrl;
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  if (!fromParam || !toParam) {
    return Response.json(
      { error: "Missing required query params: from, to" },
      { status: 400 }
    );
  }

  // Parse YYYY-MM-DD as Tashkent midnight → UTC
  // Tashkent is UTC+5, so midnight local = UTC-5h offset
  function tashkentMidnightToUtc(dateStr: string): Date {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d) - 5 * 60 * 60 * 1000);
  }

  const from = tashkentMidnightToUtc(fromParam);
  // `to` from the client is exclusive (start of that day already acts as upper bound)
  const to = tashkentMidnightToUtc(toParam);

  // Validate parsed dates
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return Response.json({ error: "Invalid date format. Use YYYY-MM-DD." }, { status: 400 });
  }

  const prisma = db as import("@prisma/client").PrismaClient;

  const txs = await prisma.transaction.findMany({
    where: {
      userId: user.id,
      deletedAt: null,
      occurredAt: { gte: from, lt: to },
    },
    include: { category: true },
    orderBy: { occurredAt: "asc" },
  });

  // ── incomeVsExpense ──────────────────────────────────────────────────────────
  let incomeTotalBig = 0n;
  let expenseTotalBig = 0n;

  // ── byCategory: group by (categoryId, type) ─────────────────────────────────
  const catMap: Record<
    string,
    { categoryId: string | null; categoryName: string; income: bigint; expense: bigint }
  > = {};

  // ── trend: group by Tashkent day ─────────────────────────────────────────────
  const dayMap: Record<string, { income: bigint; expense: bigint }> = {};

  for (const tx of txs) {
    const amount = tx.amountUzs as bigint;
    const catKey = tx.categoryId ?? "__none__";
    const catName = tx.category?.name ?? "Other";

    if (!catMap[catKey]) {
      catMap[catKey] = {
        categoryId: tx.categoryId,
        categoryName: catName,
        income: 0n,
        expense: 0n,
      };
    }

    // Tashkent day bucket
    const tzDate = new Date(tx.occurredAt.getTime() + 5 * 60 * 60 * 1000);
    const bucket = tzDate.toISOString().slice(0, 10);
    if (!dayMap[bucket]) dayMap[bucket] = { income: 0n, expense: 0n };

    if (tx.type === TxType.income) {
      incomeTotalBig += amount;
      catMap[catKey].income += amount;
      dayMap[bucket].income += amount;
    } else {
      expenseTotalBig += amount;
      catMap[catKey].expense += amount;
      dayMap[bucket].expense += amount;
    }
  }

  // Build byCategory array in AnalyticsDTO shape:
  // { categoryId, categoryName, type, amount }[] — one entry per (category, type) pair
  const byCategory: AnalyticsDTO["byCategory"] = [];
  for (const v of Object.values(catMap)) {
    if (v.income > 0n) {
      byCategory.push({
        categoryId: v.categoryId,
        categoryName: v.categoryName,
        type: "income",
        amount: v.income.toString(),
      });
    }
    if (v.expense > 0n) {
      byCategory.push({
        categoryId: v.categoryId,
        categoryName: v.categoryName,
        type: "expense",
        amount: v.expense.toString(),
      });
    }
  }

  const trend: AnalyticsDTO["trend"] = Object.entries(dayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, v]) => ({
      bucket,
      income: v.income.toString(),
      expense: v.expense.toString(),
      net: (v.income - v.expense).toString(),
    }));

  const result: AnalyticsDTO = {
    incomeVsExpense: {
      income: incomeTotalBig.toString(),
      expense: expenseTotalBig.toString(),
    },
    byCategory,
    trend,
  };

  return Response.json(result);
}
