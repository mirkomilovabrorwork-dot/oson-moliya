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
  /** Pre-formatted total string to show in center (e.g. "1 234 000 so'm") */
  totalLabel: string;
}

const COLORS = [
  "#2563eb", "#059669", "#f59e0b",
  "#7c3aed", "#0891b2", "#dc2626",
  "#db2777", "#64748b", "#ca8a04",
  "#0d9488",
];

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
  payload?: Array<{ name: string; value: number; payload: { fill: string } }>;
}) => {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
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
        {formatMoney(entry.value)}
      </p>
    </div>
  );
};

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

  const totalKey = t("home.total", lang);

  return (
    <div className="relative">
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
          <Tooltip content={<CustomTooltip />} />
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

      {/* Center overlay — positioned over the donut hole */}
      <div
        className="absolute pointer-events-none flex flex-col items-center justify-center"
        style={{
          top: 0,
          left: 0,
          right: 0,
          height: "240px",
          paddingBottom: "32px", // account for legend
        }}
      >
        <span
          className="text-[10px] font-medium uppercase tracking-wide"
          style={{ color: "var(--fg-subtle)" }}
        >
          {totalKey}
        </span>
        <span
          className="text-[11px] font-bold tabular text-center leading-tight mt-0.5"
          style={{ color: "var(--fg)", maxWidth: 88 }}
        >
          {totalLabel}
        </span>
      </div>
    </div>
  );
}
