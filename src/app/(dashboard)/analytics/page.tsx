import { getSessionUser } from "@/lib/auth/session";
import { resolveLang, t } from "@/lib/i18n";
import { db } from "@/lib/db";
import { TopNav } from "@/components/TopNav";
import { BottomNav } from "@/components/BottomNav";
import { AnalyticsClient } from "./AnalyticsClient";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const lang = await resolveLang(user.language);

  // Default: this month
  const now = new Date(Date.now() + 5 * 60 * 60 * 1000); // Tashkent now
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const monthStart = new Date(Date.UTC(year, month - 1, 1) - 5 * 60 * 60 * 1000);
  const monthEnd = new Date(Date.now() + 5 * 60 * 60 * 1000);

  const prisma = db as import("@prisma/client").PrismaClient;

  const txs = await prisma.transaction.findMany({
    where: {
      userId: user.id,
      deletedAt: null,
      occurredAt: { gte: monthStart, lte: monthEnd },
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
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <TopNav lang={lang} />
      <BottomNav lang={lang} />
      <main className="max-w-5xl mx-auto px-5 sm:px-8 py-8 pb-24 sm:pb-8 space-y-8">
        <h1 className="text-2xl font-bold" style={{ color: "var(--fg)" }}>
          {t("analytics.title", lang)}
        </h1>
        <AnalyticsClient
          userId={user.id}
          lang={lang}
          defaultIncome={incomeTotal}
          defaultExpense={expenseTotal}
          defaultByCategory={byCategory}
          defaultTrend={trend}
        />
      </main>
    </div>
  );
}
