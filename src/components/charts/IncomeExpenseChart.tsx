"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from "recharts";
import type { LangCode } from "@/lib/i18n/translate";
import { t } from "@/lib/i18n/translate";

interface Props {
  income: number;
  expense: number;
  lang: LangCode;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

/** Space-grouped money formatter — reliable on Vercel/Node (mirrors --income:#3f7d5a --expense:#b5453b tokens) */
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

const CustomTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; fill: string }>;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="text-xs rounded-[10px] p-3 space-y-1"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: entry.fill }}
          />
          <span style={{ color: "var(--fg-muted)" }}>{entry.name}:</span>
          <span
            className="font-semibold tabular"
            style={{ color: "var(--fg)" }}
          >
            {formatMoney(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

export function IncomeExpenseChart({ income, expense, lang }: Props) {
  if (income === 0 && expense === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-3">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ background: "var(--surface-sunken)" }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--fg-subtle)" }}>
            <rect x="3" y="12" width="4" height="9" rx="1"/>
            <rect x="10" y="7" width="4" height="14" rx="1"/>
            <rect x="17" y="3" width="4" height="18" rx="1"/>
          </svg>
        </div>
        <p className="text-sm" style={{ color: "var(--fg-subtle)" }}>
          {t("analytics.empty", lang)}
        </p>
      </div>
    );
  }

  // Colors mirror CSS tokens: --income:#3f7d5a  --expense:#b5453b
  const data = [
    {
      name: t("analytics.total_income", lang),
      value: income,
      fill: "#3f7d5a",
    },
    {
      name: t("analytics.total_expense", lang),
      value: expense,
      fill: "#b5453b",
    },
  ];

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }} barSize={40}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--border)"
          vertical={false}
        />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: "var(--fg-subtle)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={fmt}
          tick={{ fontSize: 11, fill: "var(--fg-subtle)" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
