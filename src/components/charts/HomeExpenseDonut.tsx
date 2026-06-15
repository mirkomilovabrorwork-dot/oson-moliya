"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { LangCode } from "@/lib/i18n/translate";
import { t } from "@/lib/i18n/translate";

interface CatEntry {
  categoryName: string;
  amount: number;
}

interface Props {
  data: CatEntry[];
  lang: LangCode;
  totalLabel: string;
}

// Chart palette — uses CSS tokens (works in light + dark)
const COLORS = [
  "var(--expense)",
  "var(--accent)",
  "var(--chart-5)",
  "var(--fg-subtle)",
  "var(--border-strong)",
];

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
function ChartTooltip({ active, payload, lang }: { active?: boolean; payload?: readonly any[]; lang: string }) {
  if (!active || !payload?.length) return null;
  const entry = payload[0] as { name: string; value: number; payload: { fill: string } };
  return (
    <div
      className="text-xs rounded-[10px] p-3"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center gap-2">
        <span
          className="w-2.5 h-2.5 rounded-full"
          style={{ background: entry.payload.fill }}
        />
        <span className="font-medium" style={{ color: "var(--fg)" }}>
          {entry.name}
        </span>
      </div>
      <p className="mt-1 font-semibold tabular" style={{ color: "var(--fg-muted)" }}>
        {formatMoney(entry.value, lang)}
      </p>
    </div>
  );
}

export function HomeExpenseDonut({ data, lang, totalLabel }: Props) {
  const filtered = data.filter((d) => d.amount > 0);

  if (!filtered.length) {
    return (
      <div className="flex flex-col items-center justify-center py-10 space-y-3">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ background: "var(--surface-sunken)" }}
        >
          <svg
            width="22"
            height="22"
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
        <p className="text-sm" style={{ color: "var(--fg-subtle)" }}>
          {t("analytics.empty", lang)}
        </p>
      </div>
    );
  }

  const pieData = filtered
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10)
    .map((d, i) => ({
      name: d.categoryName,
      value: d.amount,
      fill: COLORS[i % COLORS.length],
    }));
  const total = pieData.reduce((sum, entry) => sum + entry.value, 0);
  const totalKey = t("home.total", lang);

  return (
    <div className="space-y-4">
      <div className="relative hidden sm:block">
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="45%"
              innerRadius={52}
              outerRadius={82}
              dataKey="value"
              strokeWidth={0}
            >
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Pie>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Tooltip content={(props: any) => <ChartTooltip {...props} lang={lang} />} />
            <Legend
              iconType="circle"
              iconSize={7}
              wrapperStyle={{ fontSize: 11 }}
              formatter={(value: string) => (
                <span style={{ color: "var(--fg-muted)" }}>{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>

        <div
          className="absolute pointer-events-none flex flex-col items-center justify-center"
          style={{
            top: 0,
            left: 0,
            right: 0,
            height: "240px",
            paddingBottom: "32px",
          }}
        >
          <span
            className="text-[10px] font-medium uppercase tracking-wide"
            style={{ color: "var(--fg-subtle)" }}
          >
            {totalKey}
          </span>
          <span
            className="text-[11px] font-semibold tabular text-center leading-tight mt-0.5"
            style={{ color: "var(--fg)", maxWidth: 88 }}
          >
            {totalLabel}
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {pieData.slice(0, 5).map((entry, index) => {
          const percent = total > 0 ? Math.round((entry.value / total) * 100) : 0;
          return (
            <div key={entry.name} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: entry.fill }}
                  />
                  <span className="truncate font-medium" style={{ color: "var(--fg)" }}>
                    {entry.name}
                  </span>
                </div>
                <span className="tabular shrink-0" style={{ color: "var(--fg-muted)" }}>
                  {formatMoney(entry.value, lang)}
                </span>
              </div>
              <div
                className="h-2 rounded-full overflow-hidden"
                style={{ background: "var(--surface-sunken)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(percent, 3)}%`,
                    background: index === 0 ? "var(--expense)" : "var(--accent)",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
