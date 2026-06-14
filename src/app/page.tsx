import { getSessionUser } from "@/lib/auth/session";
import { getOverview } from "@/lib/services/transactions";
import { db } from "@/lib/db";
import { resolveLang, t } from "@/lib/i18n";
import { BudgetBar } from "@/components/BudgetBar";
import { TopNav } from "@/components/TopNav";
import { BottomNav } from "@/components/BottomNav";
import { AddSheet } from "@/components/AddSheet";
import { HomeExpenseDonut } from "@/components/charts/HomeExpenseDonut";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { BudgetDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

// Deterministic date formatter — no locale-dependent Intl.DateTimeFormat so SSR and
// client always produce the same string (avoids hydration mismatch).
const MONTHS_UZ = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"];
const MONTHS_RU = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(date: Date, lang: string): string {
  // Convert to Tashkent (UTC+5) by shifting the date value
  const tDate = new Date(date.getTime() + 5 * 60 * 60 * 1000);
  const day = tDate.getUTCDate();
  const monthIdx = tDate.getUTCMonth(); // 0-based
  const months = lang === "ru" ? MONTHS_RU : lang === "en" ? MONTHS_EN : MONTHS_UZ;
  return `${String(day).padStart(2, "0")} ${months[monthIdx]}`;
}

function formatMoney(val: bigint): string {
  const parts: string[] = [];
  let n = val < 0n ? -val : val;
  while (n >= 1000n) {
    parts.unshift(String(n % 1000n).padStart(3, "0"));
    n = n / 1000n;
  }
  parts.unshift(String(n));
  return (val < 0n ? "−" : "") + parts.join(" ") + " so'm";
}

function formatMoneyShort(val: bigint): string {
  const parts: string[] = [];
  let n = val < 0n ? -val : val;
  while (n >= 1000n) {
    parts.unshift(String(n % 1000n).padStart(3, "0"));
    n = n / 1000n;
  }
  parts.unshift(String(n));
  return parts.join(" ") + " so'm";
}

export default async function OverviewPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const lang = await resolveLang(user.language);
  const overview = await getOverview(user.id, "this_month");

  const prisma = db as import("@prisma/client").PrismaClient;

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

  // Expense-by-category groupBy for both budgets and the donut
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

  // Expense-by-category for the donut: join category names
  const categoryIds = Array.from(spentMap.keys());
  const categoryNames =
    categoryIds.length > 0
      ? await prisma.category.findMany({
          where: { id: { in: categoryIds }, userId: user.id },
          select: { id: true, name: true },
        })
      : [];
  const catNameMap = new Map<string, string>(categoryNames.map((c) => [c.id, c.name]));

  const donutData = Array.from(spentMap.entries())
    .map(([catId, amt]) => ({
      categoryName: catNameMap.get(catId) ?? "—",
      amount: Number(amt),
    }))
    .filter((d) => d.amount > 0);

  const isEmpty = recent.length === 0;

  // Net sign/color
  const net = overview.net;
  const netPositive = net >= 0n;

  // Period comparison helpers (P0-A2) — net delta shown on hero
  const prevNet = overview.prevNet;

  function buildDeltaLine(
    current: bigint,
    prev: bigint,
    metricType: "income" | "expense" | "net"
  ): { text: string; color: string } | null {
    if (prev === 0n) {
      return {
        text: t("home.delta.no_prev", lang),
        color: "var(--fg-subtle)",
      };
    }
    const sameSign = (current >= 0n) === (prev >= 0n);
    if (!sameSign) {
      // Show absolute movement
      const fmtPrev = formatMoney(prev < 0n ? -prev : prev);
      const fmtCurr = formatMoney(current < 0n ? -current : current);
      const tpl = t("home.delta.sign_change", lang)
        .replace("{prev}", (prev < 0n ? "−" : "+") + fmtPrev)
        .replace("{curr}", (current < 0n ? "−" : "+") + fmtCurr);
      return { text: tpl, color: "var(--fg-muted)" };
    }
    const diff = current - prev;
    const base = prev < 0n ? -prev : prev;
    const rawPct = Number((diff * 100n) / base);
    const absPct = Math.abs(rawPct);
    const sign = diff >= 0n ? "+" : "";
    const pctStr = absPct > 999 ? `${sign}>999%` : `${sign}${Math.round(rawPct)}%`;
    // Direction: income/net up = good (green); expense up = bad (red)
    const good = metricType === "expense" ? diff <= 0n : diff >= 0n;
    const arrow = diff >= 0n ? "▲" : "▼";
    return {
      text: `${arrow} ${pctStr} ${t("overview.vs_last_month", lang)}`,
      color: good ? "var(--income)" : "var(--expense)",
    };
  }

  const netDelta = buildDeltaLine(net, prevNet, "net");

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <TopNav lang={lang} />
      <BottomNav lang={lang} />
      <AddSheet lang={lang} />

      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-6 pb-28 space-y-5">

        {/* 1 — Balance hero card */}
        <div
          className="p-4 sm:p-5 rounded-[18px]"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <p
            className="text-xs font-semibold uppercase tracking-wide pl-0.5 mb-1"
            style={{ color: "var(--fg-subtle)" }}
          >
            {t("home.balance", lang)}
          </p>
          <p
            className="text-[10px] font-medium mb-2 pl-0.5"
            style={{ color: "var(--fg-subtle)", opacity: 0.7 }}
          >
            {t("home.scope_hero", lang)}
          </p>
          <p
            className="text-3xl font-bold tabular"
            style={{ color: netPositive ? "var(--fg)" : "var(--expense)" }}
          >
            {netPositive ? "+" : "−"}
            {formatMoneyShort(net < 0n ? -net : net)}
          </p>
          {netDelta && (
            <p
              className="text-xs font-medium mt-1.5 pl-0.5"
              style={{ color: netDelta.color }}
            >
              {netDelta.text}
            </p>
          )}
          <div className="flex items-center gap-5 mt-3">
            <div className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: "var(--income)" }}
              />
              <span
                className="text-sm font-medium tabular"
                style={{ color: "var(--income)" }}
              >
                +{formatMoneyShort(overview.income)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: "var(--expense)" }}
              />
              <span
                className="text-sm font-medium tabular"
                style={{ color: "var(--expense)" }}
              >
                −{formatMoneyShort(overview.expense)}
              </span>
            </div>
          </div>
        </div>

        {/* 2 — Expense overview card */}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.12fr)_minmax(360px,0.88fr)]">
          <div className="space-y-5">
        <div
          className="p-4 sm:p-5 rounded-[18px]"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <p
              className="text-xs font-semibold uppercase tracking-wide pl-0.5"
              style={{ color: "var(--fg-subtle)" }}
            >
              {t("home.expense_overview", lang)}
            </p>
            <Link
              href="/analytics"
              className="text-xs font-medium"
              style={{ color: "var(--accent)" }}
            >
              {t("home.more", lang)} &rarr;
            </Link>
          </div>
          <HomeExpenseDonut
            data={donutData}
            lang={lang}
            totalLabel={formatMoneyShort(overview.expense)}
          />
        </div>

        {/* 3 — Recent transactions card */}
          </div>
          <div className="space-y-5">
        <div
          className="rounded-[18px] overflow-hidden"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <div
            className="flex items-center justify-between px-4 py-3.5"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <h2 className="font-semibold text-sm" style={{ color: "var(--fg)" }}>
              {t("home.scope_recent", lang)}
            </h2>
            <Link
              href="/transactions"
              className="text-xs font-medium"
              style={{ color: "var(--accent)" }}
            >
              {t("overview.view_all", lang)} &rarr;
            </Link>
          </div>

          {isEmpty ? (
            <div className="px-4 py-10 text-center space-y-3">
              <div
                className="mx-auto w-9 h-9 rounded-[12px] flex items-center justify-center"
                style={{ background: "var(--surface-sunken)" }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ color: "var(--fg-subtle)" }}
                >
                  <rect x="2" y="7" width="20" height="14" rx="2" />
                  <path d="M16 7V5a2 2 0 0 0-4 0v2" />
                  <path d="M8 7V5a2 2 0 0 0-4 0v2" />
                </svg>
              </div>
              <p className="text-sm font-medium" style={{ color: "var(--fg-muted)" }}>
                {t("empty.overview", lang)}
              </p>
              <p className="text-xs" style={{ color: "var(--fg-subtle)" }}>
                {t("empty.overview.hint", lang)}
              </p>
            </div>
          ) : (
            <div>
              {recent.map((tx, idx) => (
                <div
                  key={tx.id}
                  className="row-hover flex items-center justify-between px-4 py-3.5 transition-colors"
                  style={{
                    borderBottom:
                      idx < recent.length - 1
                        ? "1px solid var(--border)"
                        : undefined,
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-9 h-9 rounded-[12px] flex items-center justify-center shrink-0 text-sm"
                      style={{
                        background: "var(--surface-sunken)",
                        color: "var(--fg-muted)",
                      }}
                    >
                      {tx.category?.emoji ?? (tx.type === "income" ? "↑" : "↓")}
                    </span>
                    <div className="min-w-0">
                      <p
                        className="text-sm font-medium truncate"
                        style={{ color: "var(--fg)" }}
                      >
                        {tx.category?.name ?? "—"}
                      </p>
                      <p className="text-xs" style={{ color: "var(--fg-subtle)" }}>
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
                          ? "var(--income)"
                          : "var(--expense)",
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

        {/* 4 — Budget bars card (only when budgets exist) */}
        {budgetDTOs.length > 0 && (
          <div
            className="rounded-[18px] p-4 sm:p-5 space-y-4"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm" style={{ color: "var(--fg)" }}>
                {t("overview.budget_alerts", lang)}
              </h2>
              <Link
                href="/categories"
                className="text-xs font-medium"
                style={{ color: "var(--accent)" }}
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
        </div>
      </main>
    </div>
  );
}
