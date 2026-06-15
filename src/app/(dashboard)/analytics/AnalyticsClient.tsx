"use client";

import { useState, useCallback } from "react";
import type { LangCode } from "@/lib/i18n/translate";
import { t } from "@/lib/i18n/translate";
import { IncomeExpenseChart } from "@/components/charts/IncomeExpenseChart";
import { TrendLine } from "@/components/charts/TrendLine";
import type { DisplayCurrency, Rates } from "@/lib/rates";
import { formatMoney as formatMoneyFn } from "@/lib/currency";
import { translateCategoryName } from "@/lib/categories-i18n";

type Period = "this_month" | "last_month" | "this_year" | "custom";

interface CatData {
  categoryId: string | null;
  categoryName: string;
  income: number;
  expense: number;
}

interface TrendData {
  bucket: string;
  income: number;
  expense: number;
  net: number;
}

interface Props {
  userId: string;
  lang: LangCode;
  currency: DisplayCurrency;
  rates: Rates;
  defaultIncome: number;
  defaultExpense: number;
  defaultByCategory: CatData[];
  defaultTrend: TrendData[];
}

function getTashkentMonth(offset = 0) {
  const now = new Date(Date.now() + 5 * 60 * 60 * 1000);
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth() + 1 + offset;
  while (month <= 0) {
    month += 12;
    year--;
  }
  while (month > 12) {
    month -= 12;
    year++;
  }
  const start = new Date(Date.UTC(year, month - 1, 1) - 5 * 60 * 60 * 1000);
  const end = new Date(Date.UTC(year, month, 1) - 5 * 60 * 60 * 1000);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

function getThisYear() {
  const now = new Date(Date.now() + 5 * 60 * 60 * 1000);
  const year = now.getUTCFullYear();
  const start = new Date(Date.UTC(year, 0, 1) - 5 * 60 * 60 * 1000);
  const tomorrow = new Date(Date.now() + 5 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000);
  return { from: start.toISOString().slice(0, 10), to: tomorrow.toISOString().slice(0, 10) };
}

/** Palette for the hero donut + ranked list. Using CSS tokens only. */
const CAT_COLORS = [
  "var(--expense)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--accent)",
  "var(--chart-5)",
];

export function AnalyticsClient({
  lang,
  currency,
  rates,
  defaultIncome,
  defaultExpense,
  defaultByCategory,
  defaultTrend,
}: Props) {
  // Currency-aware money formatter (amounts stored as UZS numbers)
  const formatMoney = (n: number) =>
    formatMoneyFn(BigInt(Math.round(n)), currency, rates, lang);

  const [period, setPeriod] = useState<Period>("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [income, setIncome] = useState(defaultIncome);
  const [expense, setExpense] = useState(defaultExpense);
  const [byCategory, setByCategory] = useState<CatData[]>(defaultByCategory);
  const [trend, setTrend] = useState<TrendData[]>(defaultTrend);

  const fetchData = useCallback(
    async (p: Period, cFrom?: string, cTo?: string) => {
      let from: string;
      let to: string;
      if (p === "this_month") {
        const b = getTashkentMonth(0);
        from = b.from;
        to = b.to;
      } else if (p === "last_month") {
        const b = getTashkentMonth(-1);
        from = b.from;
        to = b.to;
      } else if (p === "this_year") {
        const b = getThisYear();
        from = b.from;
        to = b.to;
      } else {
        from = cFrom || "";
        to = cTo || "";
        if (!from || !to) return;
      }

      setLoading(true);
      setError(null);
      try {
        const url = `/api/analytics?from=${from}&to=${to}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error();
        const data = (await res.json()) as {
          incomeVsExpense: { income: string; expense: string };
          byCategory: {
            categoryId: string | null;
            categoryName: string;
            type: string;
            amount: string;
          }[];
          trend: {
            bucket: string;
            income: string;
            expense: string;
            net: string;
          }[];
        };
        setIncome(Number(data.incomeVsExpense.income));
        setExpense(Number(data.incomeVsExpense.expense));

        const catMap: Record<string, CatData> = {};
        for (const item of data.byCategory) {
          const key = item.categoryId ?? "__none__";
          if (!catMap[key])
            catMap[key] = {
              categoryId: item.categoryId,
              categoryName: item.categoryName,
              income: 0,
              expense: 0,
            };
          if (item.type === "income") catMap[key].income += Number(item.amount);
          else catMap[key].expense += Number(item.amount);
        }
        setByCategory(Object.values(catMap));

        setTrend(
          data.trend.map((b) => ({
            bucket: b.bucket,
            income: Number(b.income),
            expense: Number(b.expense),
            net: Number(b.net),
          }))
        );
      } catch {
        setError(t("error.generic", lang));
      } finally {
        setLoading(false);
      }
    },
    [lang]
  );

  const handlePeriod = (p: Period) => {
    setPeriod(p);
    if (p !== "custom") fetchData(p);
  };

  const handleCustomApply = () => {
    fetchData("custom", customFrom, customTo);
  };

  const net = income - expense;

  const periods: { key: Period; label: string }[] = [
    { key: "this_month", label: t("analytics.period.this_month", lang) },
    { key: "last_month", label: t("analytics.period.last_month", lang) },
    { key: "this_year", label: t("analytics.period.this_year", lang) },
    { key: "custom", label: t("analytics.period.custom", lang) },
  ];

  const inputStyle: React.CSSProperties = {
    border: "1px solid var(--border-strong)",
    background: "transparent",
    color: "var(--fg)",
    borderRadius: 10,
    padding: "6px 12px",
    fontSize: 13,
    height: 44,
  };

  const cardCls = "rounded-[var(--radius-md)] p-5 space-y-4";
  const cardStyle: React.CSSProperties = {
    background: "var(--surface-elevated)",
    border: "1px solid var(--border)",
  };

  // Expense by category: sorted, translated
  const expenseCats = byCategory
    .filter((c) => c.expense > 0)
    .map((c) => ({
      name: translateCategoryName(c.categoryName, lang),
      amount: c.expense,
    }))
    .sort((a, b) => b.amount - a.amount);

  const totalExpense = expenseCats.reduce((s, c) => s + c.amount, 0);
  const hasData = income > 0 || expense > 0;

  return (
    <div className="space-y-6">
      {/* ── Period selector */}
      <div className="flex flex-wrap gap-2 items-center">
        <div
          className="flex rounded-lg p-0.5 gap-0.5"
          style={{ background: "var(--surface-sunken)" }}
        >
          {periods.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handlePeriod(key)}
              className="px-3 py-1.5 text-xs font-medium transition-all min-h-[32px] rounded-[7px]"
              style={
                period === key
                  ? {
                      background: "var(--surface)",
                      color: "var(--fg)",
                      boxShadow: "var(--shadow-sm)",
                    }
                  : { color: "var(--fg-subtle)" }
              }
            >
              {label}
            </button>
          ))}
        </div>

        {period === "custom" && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs" style={{ color: "var(--fg-subtle)" }}>
              {t("analytics.from", lang)}
            </span>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              style={inputStyle}
            />
            <span className="text-xs" style={{ color: "var(--fg-subtle)" }}>
              {t("analytics.to", lang)}
            </span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              style={inputStyle}
            />
            <button
              onClick={handleCustomApply}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: "var(--accent)", color: "#fff", minHeight: 36 }}
            >
              {t("common.filter", lang)}
            </button>
          </div>
        )}

        {loading && (
          <span className="text-xs" style={{ color: "var(--fg-subtle)" }}>
            {t("common.loading", lang)}
          </span>
        )}
      </div>

      {error && (
        <div
          className="text-sm px-4 py-3 rounded-xl"
          style={{
            background: "var(--expense-wash)",
            color: "var(--expense)",
            border: "1px solid var(--expense)",
          }}
        >
          {error}
        </div>
      )}

      {/* ── (a) KPI row — responsive grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          {
            label: t("analytics.total_income", lang),
            val: income,
            color: "var(--income)",
          },
          {
            label: t("analytics.total_expense", lang),
            val: expense,
            color: "var(--expense)",
          },
          {
            label:
              net >= 0
                ? t("analytics.net_positive", lang)
                : t("analytics.net_negative", lang),
            val: Math.abs(net),
            color: net >= 0 ? "var(--income)" : "var(--expense)",
          },
        ].map(({ label, val, color }) => (
          <div
            key={label}
            className="rounded-xl p-4 flex flex-col gap-1 min-w-0"
            style={cardStyle}
          >
            <p
              className="text-[11px] font-semibold uppercase tracking-widest"
              style={{ color: "var(--fg-subtle)" }}
            >
              {label}
            </p>
            <p
              className="text-xl font-bold tabular break-words leading-snug"
              style={{ color }}
            >
              {net < 0 && label !== t("analytics.total_income", lang) && label !== t("analytics.total_expense", lang) ? "−" : ""}
              {formatMoney(val)}
            </p>
          </div>
        ))}
      </div>

      {/* ── (b) HERO — Pul qayerga ketdi? */}
      <div className={cardCls} style={cardStyle}>
        <div className="flex items-center gap-3">
          <div>
            <h2
              className="font-bold text-base"
              style={{ fontFamily: "var(--font-serif)", color: "var(--fg)" }}
            >
              {t("analytics.hero_title", lang)}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--fg-subtle)" }}>
              {t("analytics.hero_subtitle", lang)}
            </p>
          </div>
        </div>

        {!hasData || expenseCats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 space-y-3">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: "var(--surface-sunken)" }}
            >
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ color: "var(--fg-subtle)" }}
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4l3 3" />
              </svg>
            </div>
            <p className="text-sm font-medium" style={{ color: "var(--fg-muted)" }}>
              {t("analytics.empty_hero", lang)}
            </p>
            <p className="text-xs" style={{ color: "var(--fg-subtle)" }}>
              {t("analytics.empty_hero_hint", lang)}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {expenseCats.slice(0, 8).map((cat, i) => {
              const pct = totalExpense > 0 ? (cat.amount / totalExpense) * 100 : 0;
              const color = CAT_COLORS[i % CAT_COLORS.length];
              return (
                <div key={cat.name} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: color }}
                      />
                      <span
                        className="font-medium truncate"
                        style={{ color: "var(--fg)" }}
                      >
                        {cat.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className="text-xs font-bold tabular rounded-full px-2 py-0.5"
                        style={{
                          background: i === 0 ? "var(--expense-wash)" : "var(--surface-sunken)",
                          color: i === 0 ? "var(--expense)" : "var(--fg-muted)",
                        }}
                      >
                        {pct.toFixed(1)}%
                      </span>
                      <span
                        className="text-xs tabular"
                        style={{ color: "var(--fg-muted)" }}
                      >
                        {formatMoney(cat.amount)}
                      </span>
                    </div>
                  </div>
                  <div
                    className="h-2 rounded-full overflow-hidden"
                    style={{ background: "var(--surface-sunken)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.max(pct, 1.5)}%`,
                        background: color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── (c) + (d) Charts row: Income/Expense bar + Trend line */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Income vs Expense bar */}
        <div className={cardCls} style={cardStyle}>
          <h2 className="font-semibold text-sm" style={{ color: "var(--fg)" }}>
            {t("analytics.income_vs_expense", lang)}
          </h2>
          <IncomeExpenseChart income={income} expense={expense} lang={lang} />
        </div>

        {/* 6-month trend line */}
        <div className={cardCls} style={cardStyle}>
          <h2 className="font-semibold text-sm" style={{ color: "var(--fg)" }}>
            {t("analytics.trend", lang)}
          </h2>
          <TrendLine data={trend} lang={lang} />
        </div>
      </div>

      {/* ── (e) Top-5 expense categories as ranked progress bars */}
      {expenseCats.length > 0 && (
        <div className={cardCls} style={cardStyle}>
          <h2
            className="font-bold text-sm"
            style={{ fontFamily: "var(--font-serif)", color: "var(--fg)" }}
          >
            {t("analytics.top5_title", lang)}
          </h2>
          <div className="space-y-4">
            {expenseCats.slice(0, 5).map((cat, i) => {
              const pct = totalExpense > 0 ? (cat.amount / totalExpense) * 100 : 0;
              const maxAmt = expenseCats[0].amount;
              const barPct = maxAmt > 0 ? (cat.amount / maxAmt) * 100 : 0;
              const color = CAT_COLORS[i % CAT_COLORS.length];
              return (
                <div key={cat.name} className="flex items-center gap-3">
                  <span
                    className="w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0"
                    style={{ background: "var(--surface-sunken)", color: "var(--fg-muted)" }}
                  >
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="text-sm font-medium truncate"
                        style={{ color: "var(--fg)" }}
                      >
                        {cat.name}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className="text-xs tabular"
                          style={{ color: "var(--fg-subtle)" }}
                        >
                          {pct.toFixed(1)}% {t("analytics.of_total", lang)}
                        </span>
                        <span
                          className="text-sm font-semibold tabular"
                          style={{ color: "var(--expense)" }}
                        >
                          {formatMoney(cat.amount)}
                        </span>
                      </div>
                    </div>
                    <div
                      className="h-1.5 rounded-full overflow-hidden"
                      style={{ background: "var(--surface-sunken)" }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.max(barPct, 2)}%`, background: color }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
