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
import { getRates } from "@/lib/rates";
import type { DisplayCurrency } from "@/lib/rates";
import { formatMoney as formatMoneyFn, formatNative, convertNativeToMain } from "@/lib/currency";
import { translateCategoryName } from "@/lib/categories-i18n";
import type { Rates } from "@/lib/rates";

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

export default async function OverviewPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const lang = await resolveLang(user.language);
  // Treat any unknown/legacy value (e.g. "ORIGINAL") as "UZS"
  const rawCurrency = user.displayCurrency ?? "UZS";
  const currency = (["UZS", "USD", "EUR", "RUB"].includes(rawCurrency) ? rawCurrency : "UZS") as DisplayCurrency;
  const rates = await getRates();
  const fmt = (val: bigint) => formatMoneyFn(val, currency, rates, lang);
  const overview = await getOverview(user.id, "this_month");

  const prisma = db as import("@prisma/client").PrismaClient;

  const recent = await prisma.transaction.findMany({
    where: { userId: user.id, deletedAt: null },
    orderBy: { occurredAt: "desc" },
    take: 5,
    include: { category: true },
  });

  // Budget progress
  const nowUtc = new Date();
  const now = new Date(nowUtc.getTime() + 5 * 60 * 60 * 1000);
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
      categoryName: translateCategoryName(catNameMap.get(catId) ?? "—", lang),
      amount: Number(amt),
    }))
    .filter((d) => d.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  // ── ALL-TIME totals (aggregation, no row fetch) ───────────────────────────
  const [allTimeIncomeAgg, allTimeExpenseAgg] = await Promise.all([
    prisma.transaction.aggregate({
      where: { userId: user.id, type: "income", deletedAt: null },
      _sum: { amountUzs: true },
    }),
    prisma.transaction.aggregate({
      where: { userId: user.id, type: "expense", deletedAt: null },
      _sum: { amountUzs: true },
    }),
  ]);
  const allTimeIncomeUzs = allTimeIncomeAgg._sum.amountUzs ?? 0n;
  const allTimeExpenseUzs = allTimeExpenseAgg._sum.amountUzs ?? 0n;
  const allTimeBalanceUzs = allTimeIncomeUzs - allTimeExpenseUzs;

  // Convert all-time balance to main display currency
  const allTimeBalanceMain = formatMoneyFn(
    allTimeBalanceUzs < 0n ? -allTimeBalanceUzs : allTimeBalanceUzs,
    currency,
    rates,
    lang
  );
  const allTimeBalancePositive = allTimeBalanceUzs >= 0n;

  // ── ALL-TIME per-currency breakdown (groupBy, no row fetch) ──────────────
  // Group by (originalCurrency, type) — sum both amountUzs and originalAmount.
  // For rows where originalCurrency IS NULL (plain UZS), Prisma groupBy returns null.
  const allTimeCurrencyGroupsRaw = await prisma.transaction.groupBy({
    by: ["originalCurrency", "type"],
    where: { userId: user.id, deletedAt: null },
    _sum: { amountUzs: true, originalAmount: true },
  });
  // Cast to a simpler shape; TxType enum values === string literals "income"/"expense"
  const allTimeCurrencyGroups = allTimeCurrencyGroupsRaw as Array<{
    originalCurrency: string | null;
    type: "income" | "expense";
    _sum: { amountUzs: bigint | null; originalAmount: bigint | null };
  }>;

  // Build per-currency net in native units
  interface CurrencyGroup {
    income: number;
    expense: number;
  }
  const currencyGroupMap = new Map<string, CurrencyGroup>();

  for (const row of allTimeCurrencyGroups) {
    const cur = row.originalCurrency ?? "UZS";
    if (!currencyGroupMap.has(cur)) currencyGroupMap.set(cur, { income: 0, expense: 0 });
    const grp = currencyGroupMap.get(cur)!;

    // For foreign currencies use summed originalAmount (whole units, as stored).
    // For UZS rows use summed amountUzs.
    let nativeAmt: number;
    if (row.originalCurrency && row._sum.originalAmount != null) {
      nativeAmt = Number(row._sum.originalAmount);
    } else {
      nativeAmt = Number(row._sum.amountUzs ?? 0n);
    }

    if (row.type === "income") {
      grp.income += nativeAmt;
    } else {
      grp.expense += nativeAmt;
    }
  }

  // Ensure the main currency row is always present (even at 0)
  const mainCurrencyKey = currency === "UZS" ? "UZS" : currency;
  if (!currencyGroupMap.has(mainCurrencyKey)) {
    currencyGroupMap.set(mainCurrencyKey, { income: 0, expense: 0 });
  }
  // UZS is always shown
  if (!currencyGroupMap.has("UZS")) {
    currencyGroupMap.set("UZS", { income: 0, expense: 0 });
  }

  // Build sorted currency rows: UZS first, then others alphabetically
  interface CurrencyRow {
    currency: string;
    netNative: number;   // income - expense in native units
    incomeNative: number;
    expenseNative: number;
    netInMain: number;   // converted to main display currency
  }
  const currencyRows: CurrencyRow[] = [];
  for (const [cur, grp] of currencyGroupMap.entries()) {
    const netNative = grp.income - grp.expense;
    const netInMain = convertNativeToMain(netNative, cur, currency, rates);
    currencyRows.push({
      currency: cur,
      netNative,
      incomeNative: grp.income,
      expenseNative: grp.expense,
      netInMain,
    });
  }
  currencyRows.sort((a, b) => {
    if (a.currency === "UZS") return -1;
    if (b.currency === "UZS") return 1;
    return a.currency.localeCompare(b.currency);
  });

  // Grand total in main currency = sum of all netInMain
  const grandTotalInMain = currencyRows.reduce((s, r) => s + r.netInMain, 0);
  // Only show CBU note when there are foreign currencies OR when main != UZS
  const showCbuNote = currencyRows.some((r) => r.currency !== "UZS") || currency !== "UZS";

  const isEmpty = recent.length === 0;

  // This-month secondary context line
  const monthIncomeStr = fmt(overview.income);
  const monthExpenseStr = fmt(overview.expense);
  const thisMonthContext = t("home.this_month_context", lang)
    .replace("{income}", monthIncomeStr)
    .replace("{expense}", monthExpenseStr);

  return (
    <div className="min-h-screen" style={{ background: "transparent" }}>
      <TopNav lang={lang} />
      <BottomNav lang={lang} />
      <AddSheet lang={lang} mainCurrency={currency} />

      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-5 sm:py-7 pb-32 space-y-5">

        {/* 1 — UMUMIY BALANS hero card (all-time) */}
        <div
          className="p-5 sm:p-6 rounded-[var(--radius-lg)]"
          style={{ background: "var(--accent-gradient)", boxShadow: "var(--shadow-lg)" }}
        >
          <p
            className="text-xs font-semibold uppercase tracking-wide pl-0.5 mb-1"
            style={{ color: "rgba(255,255,255,.80)" }}
          >
            {t("home.total_balance", lang)}
          </p>
          <p
            className="text-2xl sm:text-4xl font-bold tabular tracking-normal break-words"
            style={{ color: "#ffffff" }}
          >
            {allTimeBalancePositive ? "+" : "−"}
            {allTimeBalanceMain}
          </p>
          {/* This-month context: smaller, on the green card */}
          <p
            className="text-xs font-medium mt-2 pl-0.5"
            style={{ color: "rgba(255,255,255,.74)" }}
          >
            {thisMonthContext}
          </p>
        </div>

        {/* 2 — Per-currency breakdown — ALWAYS visible */}
        <div
          className="p-4 sm:p-5 rounded-[var(--radius-lg)]"
          style={{ background: "var(--surface-elevated)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
        >
          <p
            className="text-xs font-semibold uppercase tracking-wide pl-0.5 mb-3"
            style={{ color: "var(--fg-subtle)" }}
          >
            {t("home.per_currency_title", lang)}
          </p>

          <div className="space-y-3">
            {currencyRows.map((row) => {
              const isPositive = row.netNative >= 0;
              const nativeFormatted = formatNative(Math.abs(row.netNative), row.currency, lang);
              // Main-currency equivalent (only show if main != native currency)
              const showEquiv = row.currency !== currency;
              const mainAmt = Math.abs(row.netInMain);
              // netInMain is ALREADY in the main currency — format natively (do NOT re-convert via formatMoneyFn, which assumes UZS input)
              const mainFormatted = formatNative(mainAmt, currency, lang);

              return (
                <div key={row.currency} className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0 text-xs font-bold"
                      style={{ background: "var(--surface-sunken)", color: "var(--fg-muted)" }}
                    >
                      {row.currency === "UZS" ? "S" : row.currency === "USD" ? "$" : row.currency === "EUR" ? "€" : row.currency === "RUB" ? "₽" : row.currency.slice(0, 1)}
                    </span>
                    <span className="text-sm font-medium" style={{ color: "var(--fg-muted)" }}>
                      {row.currency}
                    </span>
                  </div>
                  <div className="text-right min-w-0">
                    <p
                      className="text-sm font-semibold tabular"
                      style={{ color: isPositive ? "var(--income)" : "var(--expense)" }}
                    >
                      {isPositive ? "+" : "−"}{nativeFormatted}
                    </p>
                    {showEquiv && (
                      <p className="text-[11px] tabular" style={{ color: "var(--fg-subtle)" }}>
                        ≈ {isPositive ? "+" : "−"}{mainFormatted}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Grand total row — only when >1 currency row */}
          {currencyRows.length > 1 && (
            <div
              className="mt-3 pt-3 flex items-center justify-between"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <span className="text-sm font-bold" style={{ color: "var(--fg)" }}>
                {t("home.grand_total", lang)}
              </span>
              <span
                className="text-sm font-bold tabular"
                style={{ color: grandTotalInMain >= 0 ? "var(--income)" : "var(--expense)" }}
              >
                {grandTotalInMain >= 0 ? "+" : "−"}{formatNative(Math.abs(grandTotalInMain), currency, lang)}
              </span>
            </div>
          )}

          {/* CBU rate note */}
          {showCbuNote && (
            <p className="text-[11px] mt-2" style={{ color: "var(--fg-subtle)", opacity: 0.8 }}>
              {t("home.cbu_rate_note", lang)}
            </p>
          )}
        </div>

        {/* 3 — "Bu oy" stats: this-month KPIs + top categories mini view */}
        <div
          className="p-4 sm:p-5 rounded-[var(--radius-lg)] space-y-4"
          style={{ background: "var(--surface-elevated)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
        >
          <div className="flex items-center justify-between">
            <h2
              className="font-bold text-sm"
              style={{ fontFamily: "var(--font-serif)", color: "var(--fg)" }}
            >
              {t("home.this_month_stat", lang)}
            </h2>
            <Link
              href="/analytics"
              className="text-xs font-medium"
              style={{ color: "var(--accent)" }}
            >
              {t("home.more", lang)} &rarr;
            </Link>
          </div>

          {/* This-month KPI row */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[
              { label: t("home.month_income", lang), val: overview.income, color: "var(--income)" },
              { label: t("home.month_expense", lang), val: overview.expense, color: "var(--expense)" },
              {
                label: overview.income >= overview.expense ? t("analytics.net_positive", lang) : t("analytics.net_negative", lang),
                val: overview.income >= overview.expense ? overview.income - overview.expense : overview.expense - overview.income,
                color: overview.income >= overview.expense ? "var(--income)" : "var(--expense)",
              },
            ].map(({ label, val, color }) => (
              <div
                key={label}
                className="rounded-xl p-3 flex flex-col gap-1 min-w-0"
                style={{ background: "var(--surface-sunken)" }}
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide truncate" style={{ color: "var(--fg-subtle)" }}>
                  {label}
                </p>
                <p className="text-sm font-bold tabular break-words leading-tight" style={{ color }}>
                  {fmt(val)}
                </p>
              </div>
            ))}
          </div>

        </div>

        {/* 4 — Expense overview card + right column */}
        <div className="grid gap-5 grid-cols-1 lg:grid-cols-2 min-w-0">
          <div className="space-y-5">
        <div
          className="p-4 sm:p-5 rounded-[var(--radius-lg)]"
          style={{ background: "var(--surface-elevated)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
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
            totalLabel={fmt(overview.expense)}
          />
        </div>

        {/* 4 — Recent transactions card */}
          </div>
          <div className="space-y-5">
        <div
          className="rounded-[var(--radius-lg)] overflow-hidden"
          style={{ background: "var(--surface-elevated)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
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
                    {fmt(tx.amountUzs)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 5 — Budget bars card (only when budgets exist) */}
        {budgetDTOs.length > 0 && (
          <div
            className="rounded-[var(--radius-lg)] p-4 sm:p-5 space-y-4"
            style={{ background: "var(--surface-elevated)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
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
                <BudgetBar
                  key={b.categoryId}
                  budget={b}
                  lang={lang}
                  compact
                  displaySpent={fmt(BigInt(b.spentUzs))}
                  displayLimit={fmt(BigInt(b.limitUzs))}
                />
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
