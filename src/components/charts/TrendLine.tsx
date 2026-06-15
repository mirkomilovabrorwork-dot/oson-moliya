"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { LangCode } from "@/lib/i18n/translate";
import { t } from "@/lib/i18n/translate";

interface TrendBucket {
  bucket: string;
  income: number;
  expense: number;
  net: number;
}

interface Props {
  data: TrendBucket[];
  lang: LangCode;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

/** Space-grouped money formatter — uses lang-aware currency suffix (so'm / сум / UZS). */
function formatMoney(n: number, lang: string): string {
  const parts: string[] = [];
  let rem = Math.abs(Math.round(n));
  while (rem >= 1000) {
    parts.unshift(String(rem % 1000).padStart(3, "0"));
    rem = Math.floor(rem / 1000);
  }
  parts.unshift(String(rem));
  const suffix = lang === "ru" ? "сум" : lang === "en" ? "UZS" : "so'm";
  return (n < 0 ? "−" : "") + parts.join(" ") + " " + suffix;
}

// recharts tooltip props use loose generics — typed loosely here to avoid conflicts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label, lang }: { active?: boolean; payload?: readonly any[]; label?: string | number; lang: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="text-xs rounded-[10px] p-3 space-y-1"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <p className="font-semibold mb-2" style={{ color: "var(--fg)" }}>{label}</p>
      {(payload as Array<{ name: string; value: number; color: string }>).map((entry) => (
        <div key={entry.name} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: entry.color }} />
          <span style={{ color: "var(--fg-muted)" }}>{entry.name}:</span>
          <span className="font-semibold tabular" style={{ color: "var(--fg)" }}>
            {formatMoney(entry.value, lang)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function TrendLine({ data, lang }: Props) {
  if (!data.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-3">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ background: "var(--surface-sunken)" }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--fg-subtle)" }}>
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
            <polyline points="16 7 22 7 22 13"/>
          </svg>
        </div>
        <p className="text-sm" style={{ color: "var(--fg-subtle)" }}>
          {t("analytics.empty", lang)}
        </p>
      </div>
    );
  }

  const incomeLabel = t("overview.income", lang);
  const expenseLabel = t("overview.expense", lang);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="bucket"
          tick={{ fontSize: 11, fill: "var(--fg-subtle)" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: string) => v.length > 7 ? v.slice(5) : v}
        />
        <YAxis
          tickFormatter={fmt}
          tick={{ fontSize: 11, fill: "var(--fg-subtle)" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={(props) => <ChartTooltip {...props} lang={lang} />} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 11 }}
          formatter={(value: string) => (
            <span style={{ color: "var(--fg-muted)" }}>{value}</span>
          )}
        />
        {/* Colors use CSS tokens: var(--income) / var(--expense) — works in light and dark. */}
        <Line
          type="monotone"
          dataKey="income"
          name={incomeLabel}
          stroke="var(--income)"
          strokeWidth={2}
          dot={{ r: 3, fill: "var(--income)" }}
          activeDot={{ r: 5 }}
        />
        <Line
          type="monotone"
          dataKey="expense"
          name={expenseLabel}
          stroke="var(--expense)"
          strokeWidth={2}
          dot={{ r: 3, fill: "var(--expense)" }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
