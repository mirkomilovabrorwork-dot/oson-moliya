import { getSessionUser } from "@/lib/auth/session";
import { resolveLang, t } from "@/lib/i18n";
import { db } from "@/lib/db";
import { TopNav } from "@/components/TopNav";
import { BottomNav } from "@/components/BottomNav";
import { AddSheet } from "@/components/AddSheet";
import { AnalyticsClient } from "./AnalyticsClient";
import { redirect } from "next/navigation";
import { getRates } from "@/lib/rates";
import type { DisplayCurrency, Rates } from "@/lib/rates";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const lang = await resolveLang(user.language);
  // Treat any unknown/legacy value (e.g. "ORIGINAL") as "UZS"
  const rawCurrency = user.displayCurrency ?? "UZS";
  const currency: DisplayCurrency = (["UZS", "USD", "EUR", "RUB"].includes(rawCurrency) ? rawCurrency : "UZS") as DisplayCurrency;
  const rates: Rates = await getRates();

  // Default: this month — half-open window [monthStart, monthEnd) to match
  // Home/getOverview and the bot's "bu oy" window (P0-A3).
  const nowUtc = new Date();
  const now = new Date(nowUtc.getTime() + 5 * 60 * 60 * 1000); // Tashkent now
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1; // 1-based
  // monthStart = UTC midnight of 1st of this Tashkent month (UTC+5 → shift back 5h)
  const monthStart = new Date(Date.UTC(year, month - 1, 1) - 5 * 60 * 60 * 1000);
  // monthEnd = first day of NEXT Tashkent month (exclusive upper bound)
  const monthEnd = new Date(Date.UTC(year, month, 1) - 5 * 60 * 60 * 1000);

  const prisma = db as import("@prisma/client").PrismaClient;

  const txs = await prisma.transaction.findMany({
    where: {
      userId: user.id,
      deletedAt: null,
      occurredAt: { gte: monthStart, lt: monthEnd },
    },
    include: { category: true },
    orderBy: { occurredAt: "asc" },
  });

  // Compute analytics data server-side (this month default)
  let incomeTotal = 0;
  let expenseTotal = 0;
  const catMap: Record<string, { name: string; income: number; expense: number }> = {};
  const dayMap: Record<string, { income: number; expense: number }> = {};

  for (const tx of txs) {
    const amount = Number(tx.amountUzs);
    const key = tx.categoryId ?? "__none__";
    const catName = tx.category?.name ?? "Other";
    if (!catMap[key]) catMap[key] = { name: catName, income: 0, expense: 0 };
    // Day bucket in Tashkent
    const tDate = new Date(tx.occurredAt.getTime() + 5 * 60 * 60 * 1000);
    const bucket = tDate.toISOString().slice(0, 10);
    if (!dayMap[bucket]) dayMap[bucket] = { income: 0, expense: 0 };

    if (tx.type === "income") {
      incomeTotal += amount;
      catMap[key].income += amount;
      dayMap[bucket].income += amount;
    } else {
      expenseTotal += amount;
      catMap[key].expense += amount;
      dayMap[bucket].expense += amount;
    }
  }

  const byCategory = Object.entries(catMap).map(([id, v]) => ({
    categoryId: id === "__none__" ? null : id,
    categoryName: v.name,
    income: v.income,
    expense: v.expense,
  }));

  const trend = Object.entries(dayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, v]) => ({
      bucket,
      income: v.income,
      expense: v.expense,
      net: v.income - v.expense,
    }));

  return (
    <div className="min-h-screen" style={{ background: "transparent" }}>
      <TopNav lang={lang} />
      <BottomNav lang={lang} />
      <AddSheet lang={lang} mainCurrency={currency} />
      <main className="max-w-2xl mx-auto px-4 sm:px-8 py-6 pb-28 space-y-5">
        <h1
          className="text-xs font-semibold uppercase tracking-wide pl-1"
          style={{ color: "var(--fg-subtle)" }}
        >
          {t("analytics.title", lang)}
        </h1>
        <AnalyticsClient
          userId={user.id}
          lang={lang}
          currency={currency}
          rates={rates}
          defaultIncome={incomeTotal}
          defaultExpense={expenseTotal}
          defaultByCategory={byCategory}
          defaultTrend={trend}
        />
      </main>
    </div>
  );
}
