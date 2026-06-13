import { TxType } from "@prisma/client";
import { db } from "../db";

// Asia/Tashkent = UTC+5
function getTashkentNow(): Date {
  return new Date(Date.now() + 5 * 60 * 60 * 1000);
}

function getMonthBoundaries(year: number, month: number): { start: Date; end: Date } {
  // month is 1-based
  // Return UTC dates that correspond to Tashkent month start/end
  // Tashkent midnight = UTC 19:00 previous day
  const startTashkent = new Date(
    Date.UTC(year, month - 1, 1) - 5 * 60 * 60 * 1000
  );
  const endTashkent = new Date(
    Date.UTC(year, month, 1) - 5 * 60 * 60 * 1000
  );
  return { start: startTashkent, end: endTashkent };
}

export interface CreateTransactionInput {
  userId: string;
  categoryId?: string | null;
  type: TxType;
  amountUzs: bigint;
  note?: string | null;
  occurredAt?: Date;
  source?: string;
}

export async function createTransaction(input: CreateTransactionInput) {
  const prisma = db as import("@prisma/client").PrismaClient;
  return prisma.transaction.create({
    data: {
      userId: input.userId,
      categoryId: input.categoryId ?? null,
      type: input.type,
      amountUzs: input.amountUzs,
      note: input.note ?? null,
      occurredAt: input.occurredAt ?? new Date(),
      source: input.source ?? "bot",
    },
    include: { category: true },
  });
}

export interface ListTransactionsFilter {
  type?: TxType;
  categoryId?: string;
  from?: Date;
  to?: Date;
}

export async function listTransactions(
  userId: string,
  options: { limit?: number; offset?: number; filters?: ListTransactionsFilter } = {}
) {
  const prisma = db as import("@prisma/client").PrismaClient;
  const { limit = 50, offset = 0, filters = {} } = options;

  return prisma.transaction.findMany({
    where: {
      userId,
      deletedAt: null,
      type: filters.type,
      categoryId: filters.categoryId,
      occurredAt:
        filters.from || filters.to
          ? { gte: filters.from, lt: filters.to }
          : undefined,
    },
    orderBy: { occurredAt: "desc" },
    take: limit,
    skip: offset,
    include: { category: true },
  });
}

export async function getRecentTransaction(userId: string) {
  const prisma = db as import("@prisma/client").PrismaClient;
  return prisma.transaction.findFirst({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { category: true },
  });
}

export interface OverviewResult {
  income: bigint;
  expense: bigint;
  net: bigint;
  prevIncome: bigint;
  prevExpense: bigint;
  prevNet: bigint;
}

export async function getOverview(
  userId: string,
  period: "this_month" | "last_month" = "this_month"
): Promise<OverviewResult> {
  const prisma = db as import("@prisma/client").PrismaClient;
  const now = getTashkentNow();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1; // 1-based

  let currentYear = year;
  let currentMonth = month;
  let prevYear = year;
  let prevMonth = month - 1;

  if (period === "last_month") {
    currentMonth = month - 1 === 0 ? 12 : month - 1;
    currentYear = month - 1 === 0 ? year - 1 : year;
    prevMonth = currentMonth - 1 === 0 ? 12 : currentMonth - 1;
    prevYear = currentMonth - 1 === 0 ? currentYear - 1 : currentYear;
  } else {
    prevMonth = month - 1 === 0 ? 12 : month - 1;
    prevYear = month - 1 === 0 ? year - 1 : year;
  }

  const { start: curStart, end: curEnd } = getMonthBoundaries(currentYear, currentMonth);
  const { start: prevStart, end: prevEnd } = getMonthBoundaries(prevYear, prevMonth);

  const aggregate = async (from: Date, to: Date, type: TxType) => {
    const result = await prisma.transaction.aggregate({
      where: { userId, type, deletedAt: null, occurredAt: { gte: from, lt: to } },
      _sum: { amountUzs: true },
    });
    return result._sum.amountUzs ?? BigInt(0);
  };

  const [income, expense, prevIncome, prevExpense] = await Promise.all([
    aggregate(curStart, curEnd, TxType.income),
    aggregate(curStart, curEnd, TxType.expense),
    aggregate(prevStart, prevEnd, TxType.income),
    aggregate(prevStart, prevEnd, TxType.expense),
  ]);

  return {
    income,
    expense,
    net: income - expense,
    prevIncome,
    prevExpense,
    prevNet: prevIncome - prevExpense,
  };
}
