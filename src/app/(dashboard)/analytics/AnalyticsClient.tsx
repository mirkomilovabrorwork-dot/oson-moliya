"use client";

import { useState, useCallback } from "react";
import type { LangCode } from "@/lib/i18n/translate";
import { t } from "@/lib/i18n/translate";
import { IncomeExpenseChart } from "@/components/charts/IncomeExpenseChart";
import { CategoryPie } from "@/components/charts/CategoryPie";
import { TrendLine } from "@/components/charts/TrendLine";

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
  defaultIncome: number;
  defaultExpense: number;
  defaultByCategory: CatData[];
  defaultTrend: TrendData[];
}

function formatMoney(n: number): string {
  const parts: string[] = [];
  let rem = Math.abs(Math.round(n));
  while (rem >= 1000) {
    parts.unshift(String(rem % 1000).padStart(3, "0"));
    rem = Math.floor(rem / 1000);
  }
  parts.unshift(String(rem));
  return (n < 0 ? "−" : "") + parts.join(" ") + " so'm";
}

function getTashkentMonth(offset = 0) {
  const now = new Date(Date.now() + 5 * 60 * 60 * 1000);
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth() + 1 + offset;
  while (month <= 0) { month += 12; year--; }
  while (month > 12) { month -= 12; year++; }
  const start = new Date(Date.UTC(year, month - 1, 1) - 5 * 60 * 60 * 1000);
  const end = new Date(Date.UTC(year, month, 1) - 5 * 60 * 60 * 1000);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

function getThisYear() {
  const now = new Date(Date.now() + 5 * 60 * 60 * 1000);
  const year = now.getUTCFullYear();
  const start = new Date(Date.UTC(year, 0, 1) - 5 * 60 * 60 * 1000);
  // `to` is treated as EXCLUSIVE by the API — use tomorrow so today is included
  const tomorrow = new Date(Date.now() + 5 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000);
  return { from: start.toISOString().slice(0, 10), to: tomorrow.toISOString().slice(0, 10) };
}

export function AnalyticsClient({
  lang,
  defaultIncome,
  defaultExpense,
  defaultByCategory,
  defaultTrend,
}: Props) {
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
        from = b.from; to = b.to;
      } else if (p === "last_month") {
        const b = getTashkentMonth(-1);
        from = b.from; to = b.to;
      } else if (p === "this_year") {
        const b = getThisYear();
        from = b.from; to = b.to;
      } else {
        from = cFrom || ""; to = cTo || "";
        if (!from || !to) return;
      }

      setLoading(true);
      setError(null);
      try {
        const url = `/api/analytics?from=${from}&to=${to}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error();
        const data = await res.json() as {
          incomeVsExpense: { income: string; expense: string };
          byCategory: { categoryId: string | null; categoryName: string; type: string; amount: string }[];
          trend: { bucket: string; income: string; expense: string; net: string }[];
        };
        setIncome(Number(data.incomeVsExpense.income));
        setExpense(Number(data.incomeVsExpense.expense));

        // Build byCategory from response
        const catMap: Record<string, CatData> = {};
        for (const item of data.byCategory) {
          const key = item.categoryId ?? "__none__";
          if (!catMap[key]) catMap[key] = { categoryId: item.categoryId, categoryName: item.categoryName, income: 0, expense: 0 };
          if (item.type === "income") catMap[key].income += Number(item.amount);
          else catMap[key].expense += Number(item.amount);
        }
        setByCategory(Object.values(catMap));

        setTrend(data.trend.map((b) => ({
          bucket: b.bucket,
          income: Number(b.income),
          expense: Number(b.expense),
          net: Number(b.net),
        })));
      } catch {
        // API may not exist yet — silently keep current data
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

  const inputStyle = {
    border: "1px solid var(--color-border)",
    background: "var(--color-surface)",
    color: "var(--color-text-primary)",
    borderRadius: 10,
    padding: "6px 12px",
    fontSize: 13,
    height: 44,
  };

  const cardCls = "rounded-[10px] p-6 space-y-4";
  const cardStyle = { background: "var(--color-surface)", border: "1px solid var(--color-border)" };

  // expense by category for pie
  const expenseByCategory = byCategory
    .filter((c) => c.expense > 0)
    .map((c) => ({ categoryName: c.categoryName, amount: c.expense }));

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex flex-wrap gap-2 items-center">
        <div
          className="flex rounded-lg overflow-hidden"
          style={{ border: "1px solid var(--color-border)" }}
        >
          {periods.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handlePeriod(key)}
              className="px-3 py-1.5 text-xs font-semibold transition-all min-h-[36px]"
              style={
                period === key
                  ? { background: "var(--color-brand)", color: "#fff" }
                  : { background: "transparent", color: "var(--color-text-secondary)" }
              }
            >
              {label}
            </button>
          ))}
        </div>
        {period === "custom" && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              {t("analytics.from", lang)}
            </span>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              style={inputStyle}
            />
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
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
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{ background: "var(--color-brand)", color: "#fff", minHeight: 36 }}
            >
              {t("common.filter", lang)}
            </button>
          </div>
        )}
        {loading && (
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            {t("common.loading", lang)}
          </span>
        )}
      </div>

      {error && (
        <div
          className="text-sm px-4 py-3 rounded-xl"
          style={{ background: "var(--color-expense-bg)", color: "var(--color-expense)", border: "1px solid var(--color-expense)" }}
        >
          {error}
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-6">
        {[
          { label: t("analytics.total_income", lang), val: income, color: "var(--color-income)" },
          { label: t("analytics.total_expense", lang), val: expense, color: "var(--color-expense)" },
          { label: t("analytics.net", lang), val: net, color: net >= 0 ? "var(--color-income)" : "var(--color-expense)" },
        ].map(({ label, val, color }) => (
          <div
            key={label}
            className="rounded-[10px] p-5 text-center"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
          >
            <p className="text-xs mb-1 uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{label}</p>
            <p className="text-xl font-semibold tabular" style={{ color }}>
              {formatMoney(val)}
            </p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Income vs Expense bar */}
        <div className={cardCls} style={cardStyle}>
          <h2 className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>
            {t("analytics.income_vs_expense", lang)}
          </h2>
          <IncomeExpenseChart income={income} expense={expense} lang={lang} />
        </div>

        {/* Category pie */}
        <div className={cardCls} style={cardStyle}>
          <h2 className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>
            {t("analytics.by_category", lang)}
          </h2>
          <CategoryPie data={expenseByCategory} lang={lang} />
        </div>
      </div>

      {/* Trend line */}
      <div className={cardCls} style={cardStyle}>
        <h2 className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>
          {t("analytics.trend", lang)}
        </h2>
        <TrendLine data={trend} lang={lang} />
      </div>
    </div>
  );
}
