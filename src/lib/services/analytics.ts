/**
 * Server-side analytics aggregation for finance_query intents.
 * Never generates SQL from user input — only parameterized Prisma calls.
 */

import { TxType } from "@prisma/client";
import { db } from "../db";
import type { FinanceQuery } from "../types";

// ── Allowed enum sets (validated before ANY query) ──────────────────────────
const ALLOWED_METRICS = new Set([
  "sum",
  "count",
  "avg",
  "net",
  "breakdown",
  "report",
]);
const ALLOWED_PERIODS = new Set([
  "today",
  "yesterday",
  "this_week",
  "this_month",
  "last_month",
  "this_year",
  "custom",
]);
const ALLOWED_TYPES = new Set(["income", "expense"]);
const ALLOWED_GROUP_BY = new Set(["category", "day", "month"]);

// ── Tashkent helpers ──────────────────────────────────────────────────────────

/** Returns the current moment shifted to Asia/Tashkent (UTC+5). */
function tashkentNow(): Date {
  return new Date(Date.now() + 5 * 60 * 60 * 1000);
}

/**
 * Returns start-of-day in UTC for a given Tashkent "local date" (YYYY-MM-DD).
 * Tashkent midnight = UTC 19:00 of the previous calendar day.
 */
function tashkentDateToUtcStart(yyyy: number, mm: number, dd: number): Date {
  // Tashkent midnight = Date.UTC(yyyy, mm-1, dd, 0,0,0) - 5h
  return new Date(Date.UTC(yyyy, mm - 1, dd) - 5 * 60 * 60 * 1000);
}

function tashkentMonthStart(year: number, month: number): Date {
  return tashkentDateToUtcStart(year, month, 1);
}

function tashkentMonthEnd(year: number, month: number): Date {
  // Start of next month in Tashkent = exclusive upper bound
  if (month === 12) {
    return tashkentMonthStart(year + 1, 1);
  }
  return tashkentMonthStart(year, month + 1);
}

function tashkentWeekStart(now: Date): Date {
  // ISO week starts Monday; compute day-of-week in Tashkent
  const tzNow = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  const dow = tzNow.getUTCDay(); // 0=Sun..6=Sat
  const daysToMonday = (dow + 6) % 7; // days back to Monday
  const mondayUtc = new Date(tzNow.getTime());
  mondayUtc.setUTCHours(0, 0, 0, 0);
  mondayUtc.setUTCDate(mondayUtc.getUTCDate() - daysToMonday);
  // Convert Tashkent midnight to UTC
  return new Date(mondayUtc.getTime() - 5 * 60 * 60 * 1000);
}

/**
 * Resolves a FinanceQuery.period into a UTC [from, to) interval.
 */
function resolvePeriod(
  period: string,
  dateFrom?: string | null,
  dateTo?: string | null
): { from: Date; to: Date } {
  const now = tashkentNow();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1; // 1-based
  const d = now.getUTCDate();

  switch (period) {
    case "today": {
      const from = tashkentDateToUtcStart(y, m, d);
      const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
      return { from, to };
    }
    case "yesterday": {
      const yest = new Date(Date.now() + 5 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000);
      const yy = yest.getUTCFullYear();
      const ym = yest.getUTCMonth() + 1;
      const yd = yest.getUTCDate();
      const from = tashkentDateToUtcStart(yy, ym, yd);
      const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
      return { from, to };
    }
    case "this_week": {
      const from = tashkentWeekStart(new Date());
      const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
      return { from, to };
    }
    case "this_month": {
      return { from: tashkentMonthStart(y, m), to: tashkentMonthEnd(y, m) };
    }
    case "last_month": {
      const prevM = m === 1 ? 12 : m - 1;
      const prevY = m === 1 ? y - 1 : y;
      return {
        from: tashkentMonthStart(prevY, prevM),
        to: tashkentMonthEnd(prevY, prevM),
      };
    }
    case "this_year": {
      return {
        from: tashkentMonthStart(y, 1),
        to: tashkentMonthStart(y + 1, 1),
      };
    }
    case "custom": {
      if (!dateFrom || !dateTo) {
        // Fallback to this month
        return { from: tashkentMonthStart(y, m), to: tashkentMonthEnd(y, m) };
      }
      // Parse YYYY-MM-DD and treat as Tashkent midnight
      const [fy, fm, fd] = dateFrom.split("-").map(Number);
      const [ty, tm, td] = dateTo.split("-").map(Number);
      const from = tashkentDateToUtcStart(fy, fm, fd);
      // dateTo is inclusive → end of that day
      const to = new Date(
        tashkentDateToUtcStart(ty, tm, td).getTime() + 24 * 60 * 60 * 1000
      );
      return { from, to };
    }
    default:
      return { from: tashkentMonthStart(y, m), to: tashkentMonthEnd(y, m) };
  }
}

// ── Number formatting ─────────────────────────────────────────────────────────

/** Format so'm with thousand separators using spaces, e.g. 1 500 000 so'm */
function formatSom(amount: bigint): string {
  const abs = amount < 0n ? -amount : amount;
  const str = abs.toString();
  const parts: string[] = [];
  let i = str.length;
  while (i > 0) {
    parts.unshift(str.slice(Math.max(0, i - 3), i));
    i -= 3;
  }
  return parts.join(" ") + " so'm";
}

function formatSignedSom(
  amount: bigint,
  type?: "income" | "expense" | "net"
): string {
  const sign =
    amount === 0n
      ? ""
      : type === "income"
      ? "+"
      : type === "expense"
      ? "-"
      : amount > 0n
      ? "+"
      : "-";
  return sign + formatSom(amount);
}

// ── Main aggregation function ─────────────────────────────────────────────────

export interface AggregationResult {
  text: string; // Localized answer for the bot
  data: Record<string, unknown>; // Raw numbers for tests
}

export async function runAggregation(
  userId: string,
  query: FinanceQuery,
  language: "uz" | "ru" | "en" = "uz"
): Promise<AggregationResult> {
  const prisma = db as import("@prisma/client").PrismaClient;

  // ── Validate enums before any DB call ──────────────────────────────────────
  if (!ALLOWED_METRICS.has(query.metric)) {
    throw new Error(`Invalid metric: ${query.metric}`);
  }
  if (!ALLOWED_PERIODS.has(query.period)) {
    throw new Error(`Invalid period: ${query.period}`);
  }
  if (query.type && !ALLOWED_TYPES.has(query.type)) {
    throw new Error(`Invalid type: ${query.type}`);
  }
  if (query.groupBy && !ALLOWED_GROUP_BY.has(query.groupBy)) {
    throw new Error(`Invalid groupBy: ${query.groupBy}`);
  }

  const { from, to } = resolvePeriod(query.period, query.dateFrom, query.dateTo);

  // Base where clause
  const baseWhere = {
    userId,
    deletedAt: null as null | Date,
    occurredAt: { gte: from, lt: to },
    ...(query.type ? { type: query.type as TxType } : {}),
  };

  // Resolve category
  let categoryId: string | null = null;
  if (query.category) {
    const cat = await prisma.category.findFirst({
      where: {
        userId,
        name: { contains: query.category.toLowerCase(), mode: "insensitive" },
      },
    });
    categoryId = cat?.id ?? null;
    if (!categoryId) {
      const noData =
        language === "ru"
          ? `По категории "${query.category}" данных нет.`
          : language === "en"
          ? `No data found for category "${query.category}".`
          : `"${query.category}" kategoriyasi bo'yicha ma'lumot yo'q.`;
      return { text: noData, data: { count: 0 } };
    }
  }

  const whereWithCat = {
    ...baseWhere,
    ...(categoryId ? { categoryId } : {}),
  };

  // ── REPORT ────────────────────────────────────────────────────────────────
  if (query.metric === "report") {
    const [incAgg, expAgg] = await Promise.all([
      prisma.transaction.aggregate({
        where: { ...whereWithCat, type: TxType.income },
        _sum: { amountUzs: true },
        _count: true,
      }),
      prisma.transaction.aggregate({
        where: { ...whereWithCat, type: TxType.expense },
        _sum: { amountUzs: true },
        _count: true,
      }),
    ]);

    const income = incAgg._sum.amountUzs ?? 0n;
    const expense = expAgg._sum.amountUzs ?? 0n;
    const net = (income as bigint) - (expense as bigint);

    // Top 3 expense categories
    const topCats = await prisma.transaction.groupBy({
      by: ["categoryId"],
      where: { ...whereWithCat, type: TxType.expense },
      _sum: { amountUzs: true },
      orderBy: { _sum: { amountUzs: "desc" } },
      take: 3,
    });

    // Resolve category names
    const catIds = topCats
      .map((c) => c.categoryId)
      .filter((id): id is string => id !== null);
    const catRecords = catIds.length
      ? await prisma.category.findMany({ where: { id: { in: catIds } } })
      : [];
    const catMap = Object.fromEntries(catRecords.map((c) => [c.id, c.name]));

    const topLines = topCats
      .map((c, i) => {
        const catName = c.categoryId ? (catMap[c.categoryId] ?? "boshqa") : "boshqa";
        const amt = c._sum.amountUzs ?? 0n;
        return `  ${i + 1}. ${catName}: ${formatSignedSom(amt as bigint, "expense")}`;
      })
      .join("\n");

    let text: string;
    if (language === "ru") {
      text =
        `📊 Отчёт за период:\n` +
        `💰 Доход: ${formatSignedSom(income as bigint, "income")}\n` +
        `💸 Расход: ${formatSignedSom(expense as bigint, "expense")}\n` +
        `📈 Итого: ${formatSignedSom(net as bigint, "net")}\n` +
        (topLines ? `\nТоп расходы:\n${topLines}` : "");
    } else if (language === "en") {
      text =
        `📊 Report for period:\n` +
        `💰 Income: ${formatSignedSom(income as bigint, "income")}\n` +
        `💸 Expense: ${formatSignedSom(expense as bigint, "expense")}\n` +
        `📈 Net: ${formatSignedSom(net as bigint, "net")}\n` +
        (topLines ? `\nTop expenses:\n${topLines}` : "");
    } else {
      text =
        `📊 Hisobot:\n` +
        `💰 Kirim: ${formatSignedSom(income as bigint, "income")}\n` +
        `💸 Chiqim: ${formatSignedSom(expense as bigint, "expense")}\n` +
        `📈 Balans: ${formatSignedSom(net as bigint, "net")}\n` +
        (topLines ? `\nEng ko'p chiqimlar:\n${topLines}` : "");
    }

    return {
      text,
      data: {
        income: (income as bigint).toString(),
        expense: (expense as bigint).toString(),
        net: (net as bigint).toString(),
        topCategories: topCats.map((c) => ({
          categoryId: c.categoryId,
          categoryName: c.categoryId ? (catMap[c.categoryId] ?? null) : null,
          amount: ((c._sum.amountUzs ?? 0n) as bigint).toString(),
        })),
      },
    };
  }

  // ── SUM ───────────────────────────────────────────────────────────────────
  if (query.metric === "sum") {
    const agg = await prisma.transaction.aggregate({
      where: whereWithCat,
      _sum: { amountUzs: true },
    });
    const total = (agg._sum.amountUzs ?? 0n) as bigint;
    const signedTotal = query.type
      ? formatSignedSom(total, query.type)
      : formatSom(total);
    const text =
      language === "ru"
        ? `Итого: ${signedTotal}`
        : language === "en"
        ? `Total: ${signedTotal}`
        : `Jami: ${signedTotal}`;
    return { text, data: { sum: total.toString() } };
  }

  // ── COUNT ─────────────────────────────────────────────────────────────────
  if (query.metric === "count") {
    const agg = await prisma.transaction.aggregate({
      where: whereWithCat,
      _count: true,
    });
    const count = agg._count;
    const text =
      language === "ru"
        ? `Количество транзакций: ${count}`
        : language === "en"
        ? `Transaction count: ${count}`
        : `Tranzaksiyalar soni: ${count}`;
    return { text, data: { count } };
  }

  // ── AVG ───────────────────────────────────────────────────────────────────
  if (query.metric === "avg") {
    const agg = await prisma.transaction.aggregate({
      where: whereWithCat,
      _avg: { amountUzs: true },
      _count: true,
    });
    // Prisma returns Decimal for _avg on BigInt fields; convert safely
    const avgDecimal = agg._avg.amountUzs;
    const avg = avgDecimal ? BigInt(Math.round(Number(avgDecimal))) : 0n;
    const text =
      language === "ru"
        ? `Среднее: ${formatSom(avg)}`
        : language === "en"
        ? `Average: ${formatSom(avg)}`
        : `O'rtacha: ${formatSom(avg)}`;
    return { text, data: { avg: avg.toString(), count: agg._count } };
  }

  // ── NET ───────────────────────────────────────────────────────────────────
  if (query.metric === "net") {
    const [incAgg, expAgg] = await Promise.all([
      prisma.transaction.aggregate({
        where: { ...whereWithCat, type: TxType.income },
        _sum: { amountUzs: true },
      }),
      prisma.transaction.aggregate({
        where: { ...whereWithCat, type: TxType.expense },
        _sum: { amountUzs: true },
      }),
    ]);
    const income = (incAgg._sum.amountUzs ?? 0n) as bigint;
    const expense = (expAgg._sum.amountUzs ?? 0n) as bigint;
    const net = income - expense;
    const text =
      language === "ru"
        ? `Доход: ${formatSignedSom(income, "income")}\nРасход: ${formatSignedSom(expense, "expense")}\nБаланс: ${formatSignedSom(net, "net")}`
        : language === "en"
        ? `Income: ${formatSignedSom(income, "income")}\nExpense: ${formatSignedSom(expense, "expense")}\nNet: ${formatSignedSom(net, "net")}`
        : `Kirim: ${formatSignedSom(income, "income")}\nChiqim: ${formatSignedSom(expense, "expense")}\nBalans: ${formatSignedSom(net, "net")}`;
    return {
      text,
      data: {
        income: income.toString(),
        expense: expense.toString(),
        net: net.toString(),
      },
    };
  }

  // ── BREAKDOWN ─────────────────────────────────────────────────────────────
  if (query.metric === "breakdown") {
    const grouped = await prisma.transaction.groupBy({
      by: ["categoryId"],
      where: whereWithCat,
      _sum: { amountUzs: true },
      orderBy: { _sum: { amountUzs: "desc" } },
    });

    const catIds = grouped
      .map((g) => g.categoryId)
      .filter((id): id is string => id !== null);
    const catRecords = catIds.length
      ? await prisma.category.findMany({ where: { id: { in: catIds } } })
      : [];
    const catMap = Object.fromEntries(catRecords.map((c) => [c.id, c.name]));

    const lines = grouped.map((g) => {
      const name = g.categoryId ? (catMap[g.categoryId] ?? "boshqa") : "boshqa";
      const amt = (g._sum.amountUzs ?? 0n) as bigint;
      return `  • ${name}: ${formatSignedSom(amt, query.type ?? undefined)}`;
    });

    const header =
      language === "ru"
        ? "По категориям:\n"
        : language === "en"
        ? "By category:\n"
        : "Kategoriyalar bo'yicha:\n";
    const text = lines.length
      ? header + lines.join("\n")
      : language === "ru"
      ? "Нет данных за этот период."
      : language === "en"
      ? "No data for this period."
      : "Bu davr uchun ma'lumot yo'q.";

    return {
      text,
      data: {
        breakdown: grouped.map((g) => ({
          categoryId: g.categoryId,
          categoryName: g.categoryId ? (catMap[g.categoryId] ?? null) : null,
          amount: ((g._sum.amountUzs ?? 0n) as bigint).toString(),
        })),
      },
    };
  }

  // Should not reach here after validation
  throw new Error(`Unhandled metric: ${query.metric}`);
}
