import { getSessionUser } from "@/lib/auth/session";
import { getOverview } from "@/lib/services/transactions";
import { db } from "@/lib/db";
import { resolveLang, t } from "@/lib/i18n";
import { StatCard } from "@/components/StatCard";
import { QuickAddForm } from "@/components/QuickAddForm";
import { BudgetBar } from "@/components/BudgetBar";
import { TopNav } from "@/components/TopNav";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { BudgetDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

function formatDate(date: Date, lang: string): string {
  return new Intl.DateTimeFormat(
    lang === "ru" ? "ru-RU" : lang === "en" ? "en-US" : "uz-UZ",
    { day: "2-digit", month: "short", timeZone: "Asia/Tashkent" }
  ).format(date);
}

function formatMoney(val: bigint): string {
  const parts: string[] = [];
  let n = val < 0n ? -val : val;
  while (n >= 1000n) {
    parts.unshift(String(n % 1000n).padStart(3, "0"));
    n = n / 1000n;
  }
  parts.unshift(String(n));
  return (val < 0n ? "−" : "") + parts.join(" ") + " so’m";
}

export default async function OverviewPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const lang = await resolveLang(user.language);
  const overview = await getOverview(user.id, "this_month");

  const prisma = db as import("@prisma/client").PrismaClient;

  const categories = await prisma.category.findMany({
    where: { userId: user.id },
    select: { id: true, name: true, type: true, emoji: true },
    orderBy: { name: "asc" },
  });

  const recent = await prisma.transaction.findMany({
    where: { userId: user.id, deletedAt: null },
    orderBy: { occurredAt: "desc" },
    take: 5,
    include: { category: true },
  });

  // Budget progress
  const now = new Date(Date.now() + 5 * 60 * 60 * 1000);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const monthStart = new Date(Date.UTC(year, month - 1, 1) - 5 * 60 * 60 * 1000);
  const monthEnd = new Date(Date.UTC(year, month, 1) - 5 * 60 * 60 * 1000);

  const budgets = await prisma.budget.findMany({
    where: { userId: user.id },
    include: { category: true },
  });

  // Single groupBy query replaces N+1 per-budget aggregate calls
  const spentRows = await prisma.transaction.groupBy({
    by: ["categoryId"],
    where: {
      userId: user.id,
      type: "expense",
      deletedAt: null,
      occurredAt: { gte: monthStart, lt: monthEnd },
    },
    _sum: { amountUzs: true },
  });
  const spentMap = new Map<string, bigint>(
    spentRows
      .filter((r) => r.categoryId !== null)
      .map((r) => [r.categoryId as string, r._sum.amountUzs ?? 0n])
  );

  const budgetDTOs: BudgetDTO[] = budgets.map((b) => {
    const spent = spentMap.get(b.categoryId) ?? 0n;
    const pct = b.limitUzs > 0n ? Math.round(Number((spent * 100n) / b.limitUzs)) : 0;
    return {
      categoryId: b.categoryId,
      categoryName: b.category.name,
      limitUzs: b.limitUzs.toString(),
      spentUzs: spent.toString(),
      percent: pct,
    };
  });

  const serializedCategories = categories.map((c) => ({ ...c, type: c.type as string }));
  const isEmpty = recent.length === 0;

  return (
    <div className="min-h-screen" style={{ background: "var(--color-bg)" }}>
      <TopNav lang={lang} />

      <main className="max-w-5xl mx-auto px-5 sm:px-8 py-8 space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>
            {t("overview.title", lang)}
          </h1>
          <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            {t("overview.this_month", lang)}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <StatCard
            label={t("overview.income", lang)}
            amount={overview.income.toString()}
            prevAmount={overview.prevIncome.toString()}
            type="income"
            comparisonLabel={t("overview.vs_last_month", lang)}
          />
          <StatCard
            label={t("overview.expense", lang)}
            amount={overview.expense.toString()}
            prevAmount={overview.prevExpense.toString()}
            type="expense"
            comparisonLabel={t("overview.vs_last_month", lang)}
          />
          <StatCard
            label={t("overview.net", lang)}
            amount={overview.net.toString()}
            prevAmount={overview.prevNet.toString()}
            type="net"
            comparisonLabel={t("overview.vs_last_month", lang)}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 space-y-6">
            {/* Recent transactions */}
            <div
              className="rounded-[10px] overflow-hidden"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
            >
              <div
                className="flex items-center justify-between px-5 py-4 border-b"
                style={{ borderColor: "var(--color-border)" }}
              >
                <h2 className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>
                  {t("overview.recent", lang)}
                </h2>
                <Link
                  href="/transactions"
                  className="text-xs font-medium"
                  style={{ color: "var(--color-brand)" }}
                >
                  {t("overview.view_all", lang)} &rarr;
                </Link>
              </div>

              {isEmpty ? (
                <div className="px-5 py-12 text-center space-y-3">
                  <div className="text-4xl">📊</div>
                  <p className="font-medium" style={{ color: "var(--color-text-secondary)" }}>
                    {t("empty.overview", lang)}
                  </p>
                  <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                    {t("empty.overview.hint", lang)}
                  </p>
                  <a
                    href="https://t.me/oson_moliya_bot"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                    style={{ background: "var(--color-brand)", color: "#fff" }}
                  >
                    {t("onboarding.open_bot", lang)}
                  </a>
                </div>
              ) : (
                <div>
                  {recent.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between px-5 py-3.5 border-b transition-colors"
                      style={{ borderColor: "var(--color-border)" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--color-surface-2)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-lg shrink-0">
                          {tx.category?.emoji ?? (tx.type === "income" ? "💰" : "📤")}
                        </span>
                        <div className="min-w-0">
                          <p
                            className="text-sm font-medium truncate"
                            style={{ color: "var(--color-text-primary)" }}
                          >
                            {tx.category?.name ?? "—"}
                          </p>
                          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                            {formatDate(tx.occurredAt, lang)}
                            {tx.note ? ` · ${tx.note}` : ""}
                          </p>
                        </div>
                      </div>
                      <span
                        className="text-sm font-semibold tabular shrink-0 ml-4"
                        style={{
                          color:
                            tx.type === "income"
                              ? "var(--color-income)"
                              : "var(--color-expense)",
                        }}
                      >
                        {tx.type === "income" ? "+" : "−"}
                        {formatMoney(tx.amountUzs)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Budget alerts */}
            {budgetDTOs.length > 0 && (
              <div
                className="rounded-[10px] p-6 space-y-4"
                style={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <div className="flex items-center justify-between">
                  <h2
                    className="font-semibold text-sm"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {t("overview.budget_alerts", lang)}
                  </h2>
                  <Link
                    href="/categories"
                    className="text-xs font-medium"
                    style={{ color: "var(--color-brand)" }}
                  >
                    {t("common.edit", lang)} &rarr;
                  </Link>
                </div>
                <div className="space-y-4">
                  {budgetDTOs.map((b) => (
                    <BudgetBar key={b.categoryId} budget={b} lang={lang} compact />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Quick add form */}
          <div className="lg:col-span-2">
            <QuickAddForm lang={lang} categories={serializedCategories} />
          </div>
        </div>
      </main>
    </div>
  );
}
