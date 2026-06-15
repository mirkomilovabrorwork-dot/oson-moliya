"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import type { LangCode } from "@/lib/i18n/translate";
import { t } from "@/lib/i18n/translate";

interface CatEntry {
  categoryName: string;
  amount: number;
}

interface Props {
  data: CatEntry[];
  lang: LangCode;
  /** Pre-formatted total (displayed in donut center). */
  totalLabel: string;
}

// Palette — CSS tokens (light + dark adaptive)
const SLICE_COLORS = [
  "var(--expense)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--accent)",
];
const OTHER_COLOR = "var(--border-strong)";

const OUTER = 72;
const INNER = Math.round(OUTER * 0.60);
const HEIGHT = 160;

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, lang }: { active?: boolean; payload?: readonly any[]; lang: string }) {
  if (!active || !payload?.length) return null;
  const entry = payload[0] as { name: string; value: number; payload: { fill: string } };
  return (
    <div
      className="text-xs rounded-[10px] p-2.5"
      style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-md)" }}
    >
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: entry.payload.fill }} />
        <span className="font-medium" style={{ color: "var(--fg)" }}>{entry.name}</span>
      </div>
      <p className="mt-0.5 tabular text-[11px] font-semibold" style={{ color: "var(--fg-muted)" }}>
        {formatMoney(entry.value, lang)}
      </p>
    </div>
  );
}

export function HomeExpenseDonut({ data, lang, totalLabel }: Props) {
  const filtered = data.filter((d) => d.amount > 0).sort((a, b) => b.amount - a.amount);

  if (!filtered.length) {
    return (
      <div className="flex flex-col items-center justify-center py-8 space-y-2">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{ background: "var(--surface-sunken)", border: "2px dashed var(--border-strong)" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--fg-subtle)" }}>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4l3 3" />
          </svg>
        </div>
        <p className="text-xs text-center" style={{ color: "var(--fg-subtle)" }}>
          {t("analytics.empty_hero", lang)}
        </p>
      </div>
    );
  }

  // Top 4 + "Boshqa" bucket
  const topSlices = filtered.slice(0, 4);
  const rest = filtered.slice(4);
  const otherAmount = rest.reduce((s, d) => s + d.amount, 0);
  const total = filtered.reduce((s, d) => s + d.amount, 0);

  const pieData = topSlices.map((d, i) => ({
    name: d.categoryName,
    value: d.amount,
    fill: SLICE_COLORS[i % SLICE_COLORS.length],
  }));
  if (otherAmount > 0) {
    pieData.push({ name: t("analytics.other", lang), value: otherAmount, fill: OTHER_COLOR });
  }

  return (
    <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
      {/* ── Compact donut */}
      <div className="relative shrink-0" style={{ width: OUTER * 2 + 16, height: HEIGHT }}>
        <ResponsiveContainer width="100%" height={HEIGHT}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={INNER}
              outerRadius={OUTER}
              dataKey="value"
              strokeWidth={2}
              stroke="var(--surface)"
              paddingAngle={1}
            >
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Pie>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Tooltip content={(props: any) => <ChartTooltip {...props} lang={lang} />} />
          </PieChart>
        </ResponsiveContainer>

        {/* Center: total amount */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
        >
          <span
            className="text-[10px] font-bold tabular text-center leading-tight"
            style={{ color: "var(--fg)", maxWidth: INNER * 1.5 }}
          >
            {totalLabel}
          </span>
          <span
            className="text-[9px] font-medium text-center mt-0.5"
            style={{ color: "var(--fg-subtle)", maxWidth: INNER * 1.6 }}
          >
            {t("analytics.total_spent", lang)}
          </span>
        </div>
      </div>

      {/* ── Compact legend */}
      <div className="flex-1 min-w-0 space-y-2 w-full">
        {pieData.map((entry) => {
          const pct = total > 0 ? Math.round((entry.value / total) * 100) : 0;
          return (
            <div key={entry.name} className="flex items-center gap-2 text-xs min-w-0">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: entry.fill }}
              />
              <span className="truncate flex-1 font-medium" style={{ color: "var(--fg)" }}>
                {entry.name}
              </span>
              <span className="tabular shrink-0 font-bold" style={{ color: "var(--fg-muted)" }}>
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
