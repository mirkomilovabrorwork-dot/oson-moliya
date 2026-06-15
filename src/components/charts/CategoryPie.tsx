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
  /** Pre-formatted total label (e.g. "1 250 000 so'm"). Rendered in donut center. */
  totalLabel?: string;
  /** Max slices before bucketing the rest into "Boshqa/Прочее/Other". Default 6. */
  maxSlices?: number;
  /** Outer radius in px. Default 90. innerRadius is derived as 60% of outerRadius. */
  outerRadius?: number;
  /** Chart height in px. Default 280. */
  height?: number;
}

// Distinct, tasteful palette — CSS tokens (light + dark adaptive)
const SLICE_COLORS = [
  "var(--expense)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--accent)",
  "var(--chart-5)",
  "var(--chart-2)",
];
// "Boshqa" / Other bucket always gets a muted token
const OTHER_COLOR = "var(--border-strong)";

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
  return (n < 0 ? "−" : "") + parts.join(" ") + " " + suffix;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, lang }: { active?: boolean; payload?: readonly any[]; lang: string }) {
  if (!active || !payload?.length) return null;
  const entry = payload[0] as { name: string; value: number; payload: { fill: string } };
  return (
    <div
      className="text-xs rounded-[10px] p-3 min-w-[140px]"
      style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-md)" }}
    >
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: entry.payload.fill }} />
        <span className="font-medium" style={{ color: "var(--fg)" }}>{entry.name}</span>
      </div>
      <p className="mt-1 font-semibold tabular" style={{ color: "var(--fg-muted)" }}>
        {formatMoney(entry.value, lang)}
      </p>
    </div>
  );
}

export function CategoryPie({
  data,
  lang,
  totalLabel,
  maxSlices = 6,
  outerRadius = 90,
  height = 280,
}: Props) {
  const filtered = data.filter((d) => d.amount > 0).sort((a, b) => b.amount - a.amount);

  // Empty state
  if (!filtered.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-3">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ background: "var(--surface-sunken)", border: "2px dashed var(--border-strong)" }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--fg-subtle)" }}>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4l3 3" />
          </svg>
        </div>
        <p className="text-sm font-medium" style={{ color: "var(--fg-muted)" }}>
          {t("analytics.empty_hero", lang)}
        </p>
      </div>
    );
  }

  // Bucket: top maxSlices + "Boshqa" for the rest
  const topSlices = filtered.slice(0, maxSlices);
  const rest = filtered.slice(maxSlices);
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

  const innerRadius = Math.round(outerRadius * 0.6);

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-center lg:items-start">
      {/* ── Donut */}
      <div className="relative shrink-0" style={{ width: outerRadius * 2 + 20, height }}>
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={innerRadius}
              outerRadius={outerRadius}
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

        {/* Center label */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
          style={{ paddingInline: innerRadius * 0.6 }}
        >
          {totalLabel && (
            <span
              className="text-[11px] font-bold tabular text-center leading-tight"
              style={{ color: "var(--fg)", maxWidth: innerRadius * 1.3 }}
            >
              {totalLabel}
            </span>
          )}
          <span
            className="text-[10px] font-medium text-center leading-snug mt-0.5"
            style={{ color: "var(--fg-subtle)", maxWidth: innerRadius * 1.4 }}
          >
            {t("analytics.total_spent", lang)}
          </span>
        </div>
      </div>

      {/* ── Legend list */}
      <div className="flex-1 min-w-0 space-y-2.5 w-full">
        {pieData.map((entry) => {
          const pct = total > 0 ? (entry.value / total) * 100 : 0;
          return (
            <div key={entry.name} className="flex items-center gap-3 text-sm min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0 mt-0.5"
                style={{ background: entry.fill }}
              />
              <span className="truncate flex-1 font-medium" style={{ color: "var(--fg)" }}>
                {entry.name}
              </span>
              <span className="tabular text-xs shrink-0" style={{ color: "var(--fg-subtle)" }}>
                {pct.toFixed(1)}%
              </span>
              <span className="tabular text-xs shrink-0 font-semibold" style={{ color: "var(--fg-muted)" }}>
                {formatMoney(entry.value, lang)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
