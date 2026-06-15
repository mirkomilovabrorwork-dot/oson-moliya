import { TxType } from "@prisma/client";
import { db } from "../db";
import { getTashkentNow, tashkentMonthRange } from "../dates";

/**
 * Pure decision function — no DB, no side-effects.
 * Returns whether a budget breach alert should fire for the current month.
 */
export function checkBreach(
  spentThisMonth: bigint,
  budget: { limitUzs: bigint; lastAlertedYm: string | null },
  currentYm: string // e.g. "2026-06"
): { shouldAlert: boolean; newLastAlertedYm: string | null } {
  if (spentThisMonth < budget.limitUzs) {
    return { shouldAlert: false, newLastAlertedYm: budget.lastAlertedYm };
  }
  // At or over limit — alert only if we haven't alerted this month
  if (budget.lastAlertedYm === currentYm) {
    return { shouldAlert: false, newLastAlertedYm: budget.lastAlertedYm };
  }
  return { shouldAlert: true, newLastAlertedYm: currentYm };
}

/**
 * Returns the current Tashkent "YYYY-MM" string (UTC+5).
 */
export function tashkentYm(d?: Date): string {
  const base = d ?? new Date();
  const tashkent = new Date(base.getTime() + 5 * 60 * 60 * 1000);
  const year = tashkent.getUTCFullYear();
  const month = String(tashkent.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * DB-backed check: looks up the user's budget for the given category,
 * aggregates current-Tashkent-month spend, and fires the alert at most once
 * per calendar month (guarded by Budget.lastAlertedYm).
 *
 * Returns the breach details to display, or null if no alert should fire.
 */
export async function checkExpenseBudgetBreach(
  userId: string,
  categoryId: string
): Promise<{ categoryName: string; spentUzs: bigint; limitUzs: bigint } | null> {
  const prisma = db;

  // 1. Load budget (including category name)
  const budget = await prisma.budget.findUnique({
    where: { userId_categoryId: { userId, categoryId } },
    include: { category: true },
  });
  if (!budget) return null;
  if ((budget.limitUzs as bigint) <= 0n) return null;

  // 2. Current Tashkent-month window (matches budgets/route.ts:19-27)
  const now = getTashkentNow();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const { start: monthStart, end: monthEnd } = tashkentMonthRange(year, month);

  // 3. Aggregate this-month spend for this category
  const spendGroups = await prisma.transaction.groupBy({
    by: ["categoryId"],
    where: {
      userId,
      categoryId,
      deletedAt: null,
      type: TxType.expense,
      occurredAt: { gte: monthStart, lt: monthEnd },
    },
    _sum: { amountUzs: true },
  });

  const spent = (spendGroups[0]?._sum?.amountUzs ?? 0n) as bigint;
  const limitUzs = budget.limitUzs as bigint;
  const lastAlertedYm = budget.lastAlertedYm ?? null;

  // 4. Decision
  const currentYm = tashkentYm();
  const res = checkBreach(spent, { limitUzs, lastAlertedYm }, currentYm);

  // 5. No alert → bail
  if (!res.shouldAlert) return null;

  // 6. Persist guard (race-safe: only updates if not already set for this month)
  await prisma.budget.updateMany({
    where: { userId, categoryId, NOT: { lastAlertedYm: currentYm } },
    data: { lastAlertedYm: currentYm },
  });

  // 7. Return alert data
  return {
    categoryName: budget.category.name,
    spentUzs: spent,
    limitUzs,
  };
}
