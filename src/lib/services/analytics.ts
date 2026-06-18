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
  "top",
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
      // Guard against NaN / out-of-range values; fall back to this month if invalid
      const validMonth = (n: number) => Number.isFinite(n) && n >= 1 && n <= 12;
      const validDay = (n: number) => Number.isFinite(n) && n >= 1 && n <= 31;
      const validYear = (n: number) => Number.isFinite(n) && n > 1970;
      if (
        !validYear(fy) || !validMonth(fm) || !validDay(fd) ||
        !validYear(ty) || !validMonth(tm) || !validDay(td)
      ) {
        return { from: tashkentMonthStart(y, m), to: tashkentMonthEnd(y, m) };
      }
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

// ── Bucket label helpers (pure — exported for tests) ─────────────────────────

/**
 * Given a UTC Date representing a transaction, return the Tashkent (UTC+5)
 * calendar day as "YYYY-MM-DD".
 */
export function tashkentDayLabel(utcDate: Date): string {
  const tzDate = new Date(utcDate.getTime() + 5 * 60 * 60 * 1000);
  const y = tzDate.getUTCFullYear();
  const m = String(tzDate.getUTCMonth() + 1).padStart(2, "0");
  const d = String(tzDate.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Given a UTC Date representing a transaction, return the Tashkent (UTC+5)
 * calendar month as "YYYY-MM".
 */
export function tashkentMonthLabel(utcDate: Date): string {
  const tzDate = new Date(utcDate.getTime() + 5 * 60 * 60 * 1000);
  const y = tzDate.getUTCFullYear();
  const m = String(tzDate.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// ── Delta computation (pure) ──────────────────────────────────────────────────

/**
 * Computes the absolute and percentage difference between two BigInt amounts.
 * pct is null when previous === 0 (divide-by-zero guard).
 */
export function computeDelta(
  current: bigint,
  previous: bigint
): { abs: bigint; pct: number | null } {
  const abs = current - previous;
  const pct =
    previous === 0n
      ? null
      : Number(((current - previous) * 100n) / previous);
  return { abs, pct };
}

// ── Previous-period resolver ──────────────────────────────────────────────────

/**
 * Given a period key, returns the UTC [from, to) interval for the comparable
 * PREVIOUS period (one step back).
 *
 *   today         → yesterday
 *   this_week     → the 7-day window before this week's Monday
 *   this_month    → last_month
 *   last_month    → the month before last
 *   this_year     → last year (Jan 1 – Dec 31)
 *   yesterday     → the day before yesterday
 *   custom        → same span length shifted back by the span duration
 */
function resolvePreviousPeriod(
  period: string,
  dateFrom?: string | null,
  dateTo?: string | null
): { from: Date; to: Date } {
  const now = tashkentNow();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const d = now.getUTCDate();

  switch (period) {
    case "today": {
      // yesterday
      const yest = new Date(Date.now() + 5 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000);
      const yy = yest.getUTCFullYear();
      const ym = yest.getUTCMonth() + 1;
      const yd = yest.getUTCDate();
      const from = tashkentDateToUtcStart(yy, ym, yd);
      return { from, to: new Date(from.getTime() + 24 * 60 * 60 * 1000) };
    }
    case "yesterday": {
      // day before yesterday
      const dby = new Date(Date.now() + 5 * 60 * 60 * 1000 - 2 * 24 * 60 * 60 * 1000);
      const yy = dby.getUTCFullYear();
      const ym = dby.getUTCMonth() + 1;
      const yd = dby.getUTCDate();
      const from = tashkentDateToUtcStart(yy, ym, yd);
      return { from, to: new Date(from.getTime() + 24 * 60 * 60 * 1000) };
    }
    case "this_week": {
      // 7-day window immediately before this week's Monday
      const thisWeekStart = tashkentWeekStart(new Date());
      const to = thisWeekStart;
      const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { from, to };
    }
    case "this_month": {
      const prevM = m === 1 ? 12 : m - 1;
      const prevY = m === 1 ? y - 1 : y;
      return {
        from: tashkentMonthStart(prevY, prevM),
        to: tashkentMonthEnd(prevY, prevM),
      };
    }
    case "last_month": {
      // two months ago
      const twoBack = m <= 2 ? (m === 1 ? 11 : 12) : m - 2;
      const twoBackY = m <= 2 ? y - 1 : y;
      return {
        from: tashkentMonthStart(twoBackY, twoBack),
        to: tashkentMonthEnd(twoBackY, twoBack),
      };
    }
    case "this_year": {
      return {
        from: tashkentMonthStart(y - 1, 1),
        to: tashkentMonthStart(y, 1),
      };
    }
    case "custom": {
      // Shift the same span back by span length
      const current = resolvePeriod(period, dateFrom, dateTo);
      const span = current.to.getTime() - current.from.getTime();
      return {
        from: new Date(current.from.getTime() - span),
        to: new Date(current.to.getTime() - span),
      };
    }
    default:
      // Fallback: previous month
      {
        const prevM = m === 1 ? 12 : m - 1;
        const prevY = m === 1 ? y - 1 : y;
        return {
          from: tashkentMonthStart(prevY, prevM),
          to: tashkentMonthEnd(prevY, prevM),
        };
      }
  }
}

// ── compareSpend ──────────────────────────────────────────────────────────────

export interface CompareSpendResult {
  current: bigint;
  previous: bigint;
  delta: { abs: bigint; pct: number | null };
  text: string;
}

/**
 * Compares total spend (sum metric) for the given period vs its previous
 * comparable period (today↔yesterday, this_week↔prev 7d, this_month↔last_month,
 * this_year↔last_year). Returns pre-formatted localized text.
 */
export async function compareSpend(
  userId: string,
  {
    type,
    period,
    language = "uz",
  }: {
    type?: "income" | "expense" | null;
    period: string;
    language?: "uz" | "ru" | "en";
  }
): Promise<CompareSpendResult> {
  const prisma = db as import("@prisma/client").PrismaClient;

  if (!ALLOWED_PERIODS.has(period)) {
    throw new Error(`Invalid period: ${period}`);
  }
  if (type && !ALLOWED_TYPES.has(type)) {
    throw new Error(`Invalid type: ${type}`);
  }

  const typeFilter = type ? { type: type as TxType } : {};
  const baseFilter = { userId, deletedAt: null as null | Date, ...typeFilter };

  const { from: curFrom, to: curTo } = resolvePeriod(period);
  const { from: prevFrom, to: prevTo } = resolvePreviousPeriod(period);

  const [curAgg, prevAgg] = await Promise.all([
    prisma.transaction.aggregate({
      where: { ...baseFilter, occurredAt: { gte: curFrom, lt: curTo } },
      _sum: { amountUzs: true },
    }),
    prisma.transaction.aggregate({
      where: { ...baseFilter, occurredAt: { gte: prevFrom, lt: prevTo } },
      _sum: { amountUzs: true },
    }),
  ]);

  const current = (curAgg._sum.amountUzs ?? 0n) as bigint;
  const previous = (prevAgg._sum.amountUzs ?? 0n) as bigint;
  const delta = computeDelta(current, previous);

  const curFmt = type ? formatSignedSom(current, type) : formatSom(current);
  const prevFmt = type ? formatSignedSom(previous, type) : formatSom(previous);
  const pctStr =
    delta.pct === null
      ? (language === "ru" ? "н/д" : language === "en" ? "n/a" : "n/a")
      : `${delta.pct >= 0 ? "+" : ""}${delta.pct}%`;

  let text: string;
  if (language === "ru") {
    text =
      `Текущий период: ${curFmt}\n` +
      `Предыдущий период: ${prevFmt}\n` +
      `Изменение: ${pctStr}`;
  } else if (language === "en") {
    text =
      `Current period: ${curFmt}\n` +
      `Previous period: ${prevFmt}\n` +
      `Change: ${pctStr}`;
  } else {
    text =
      `Hozirgi davr: ${curFmt}\n` +
      `O'tgan davr: ${prevFmt}\n` +
      `O'zgarish: ${pctStr}`;
  }

  return { current, previous, delta, text };
}

// ── topTransactions ───────────────────────────────────────────────────────────

export interface TopTransaction {
  amountUzs: bigint;
  category: string | null;
  note: string | null;
  occurredAt: Date;
}

/**
 * Returns the N largest transactions (by amountUzs desc) for the user + period.
 * limit is capped at 10.
 */
export async function topTransactions(
  userId: string,
  {
    type,
    period,
    limit = 5,
  }: {
    type?: "income" | "expense" | null;
    period: string;
    limit?: number;
  }
): Promise<TopTransaction[]> {
  const prisma = db as import("@prisma/client").PrismaClient;

  if (!ALLOWED_PERIODS.has(period)) {
    throw new Error(`Invalid period: ${period}`);
  }
  if (type && !ALLOWED_TYPES.has(type)) {
    throw new Error(`Invalid type: ${type}`);
  }

  const cap = Math.min(limit, 10);
  const { from, to } = resolvePeriod(period);

  const rows = await prisma.transaction.findMany({
    where: {
      userId,
      deletedAt: null,
      occurredAt: { gte: from, lt: to },
      ...(type ? { type: type as TxType } : {}),
    },
    orderBy: { amountUzs: "desc" },
    take: cap,
    select: {
      amountUzs: true,
      note: true,
      occurredAt: true,
      category: { select: { name: true } },
    },
  });

  return rows.map((r) => ({
    amountUzs: r.amountUzs as bigint,
    category: r.category?.name ?? null,
    note: r.note,
    occurredAt: r.occurredAt,
  }));
}

// ── Main aggregation function ─────────────────────────────────────────────────

export interface AggregationResult {
  text: string; // Localized answer for the bot
  data: Record<string, unknown>; // Raw numbers for tests
}

export async function runAggregation(
  userId: string,
  query: FinanceQuery & { limit?: number },
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
        `📈 Sof (kirim−chiqim): ${formatSignedSom(net as bigint, "net")}\n` +
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
    // groupBy day/month: bucket transactions in JS after a single DB fetch
    if (query.groupBy === "day" || query.groupBy === "month") {
      const rows = await prisma.transaction.findMany({
        where: whereWithCat,
        select: { amountUzs: true, type: true, occurredAt: true },
        orderBy: { occurredAt: "asc" },
      });

      const labelFn =
        query.groupBy === "day" ? tashkentDayLabel : tashkentMonthLabel;
      const bucketMap = new Map<
        string,
        { income: bigint; expense: bigint; net: bigint }
      >();
      for (const row of rows) {
        const label = labelFn(row.occurredAt);
        const existing = bucketMap.get(label) ?? {
          income: 0n,
          expense: 0n,
          net: 0n,
        };
        const amt = (row.amountUzs ?? 0n) as bigint;
        if (row.type === TxType.income) {
          existing.income += amt;
          existing.net += amt;
        } else {
          existing.expense += amt;
          existing.net -= amt;
        }
        bucketMap.set(label, existing);
      }

      const buckets = Array.from(bucketMap.entries()).map(
        ([label, { income, expense, net }]) => ({
          label,
          income,
          expense,
          net,
        })
      );

      const lines = buckets.map(
        (b) =>
          `  ${b.label}: ${formatSignedSom(b.income, "income")} / ${formatSignedSom(b.expense, "expense")} / ${formatSignedSom(b.net, "net")}`
      );
      const header =
        language === "ru"
          ? "По периодам (доход / расход / итог):\n"
          : language === "en"
          ? "By period (income / expense / net):\n"
          : "Davr bo'yicha (kirim / chiqim / sof):\n";
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
          buckets: buckets.map((b) => ({
            label: b.label,
            income: b.income.toString(),
            expense: b.expense.toString(),
            net: b.net.toString(),
          })),
        },
      };
    }

    // flat total (no groupBy or groupBy: "category")
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
    // groupBy day/month: same bucket logic, but metric is "net"
    if (query.groupBy === "day" || query.groupBy === "month") {
      const rows = await prisma.transaction.findMany({
        where: whereWithCat,
        select: { amountUzs: true, type: true, occurredAt: true },
        orderBy: { occurredAt: "asc" },
      });

      const labelFn =
        query.groupBy === "day" ? tashkentDayLabel : tashkentMonthLabel;
      const bucketMap = new Map<
        string,
        { income: bigint; expense: bigint; net: bigint }
      >();
      for (const row of rows) {
        const label = labelFn(row.occurredAt);
        const existing = bucketMap.get(label) ?? {
          income: 0n,
          expense: 0n,
          net: 0n,
        };
        const amt = (row.amountUzs ?? 0n) as bigint;
        if (row.type === TxType.income) {
          existing.income += amt;
          existing.net += amt;
        } else {
          existing.expense += amt;
          existing.net -= amt;
        }
        bucketMap.set(label, existing);
      }

      const buckets = Array.from(bucketMap.entries()).map(
        ([label, { income, expense, net }]) => ({
          label,
          income,
          expense,
          net,
        })
      );

      const lines = buckets.map(
        (b) =>
          `  ${b.label}: ${formatSignedSom(b.income, "income")} / ${formatSignedSom(b.expense, "expense")} / ${formatSignedSom(b.net, "net")}`
      );
      const header =
        language === "ru"
          ? "По периодам (доход / расход / итог):\n"
          : language === "en"
          ? "By period (income / expense / net):\n"
          : "Davr bo'yicha (kirim / chiqim / sof):\n";
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
          buckets: buckets.map((b) => ({
            label: b.label,
            income: b.income.toString(),
            expense: b.expense.toString(),
            net: b.net.toString(),
          })),
        },
      };
    }

    // flat total
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
        ? `Доход: ${formatSignedSom(income, "income")}\nРасход: ${formatSignedSom(expense, "expense")}\nИтог (доход−расход): ${formatSignedSom(net, "net")}`
        : language === "en"
        ? `Income: ${formatSignedSom(income, "income")}\nExpense: ${formatSignedSom(expense, "expense")}\nNet: ${formatSignedSom(net, "net")}`
        : `Kirim: ${formatSignedSom(income, "income")}\nChiqim: ${formatSignedSom(expense, "expense")}\nSof (kirim−chiqim): ${formatSignedSom(net, "net")}`;
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
    const breakdownLimit =
      query.limit != null && query.limit > 0
        ? Math.min(query.limit, 50)
        : undefined;
    const grouped = await prisma.transaction.groupBy({
      by: ["categoryId"],
      where: whereWithCat,
      _sum: { amountUzs: true },
      orderBy: { _sum: { amountUzs: "desc" } },
      ...(breakdownLimit != null ? { take: breakdownLimit } : {}),
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
