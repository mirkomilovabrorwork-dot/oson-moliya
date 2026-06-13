"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { PieLabelRenderProps } from "recharts";
import type { LangCode } from "@/lib/i18n/translate";
import { t } from "@/lib/i18n/translate";

interface CatEntry {
  categoryName: string;
  amount: number;
}

interface Props {
  data: CatEntry[];
  lang: LangCode;
}

// v3 chart palette — mirrors --chart-1..5 tokens (light values), then cycles warm
const COLORS = [
  "#c15f3c", "#4a7c8c", "#b08a3e",
  "#6b5b8a", "#8a8780", "#b5453b",
  "#3f7d5a", "#c8893f", "#4e7ea6",
  "#7b6fa0",
];

/** Space-grouped money formatter — reliable on Vercel/Node (mirrors --expense:#b5453b token) */
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

const RADIAN = Math.PI / 180;

const renderLabel = (props: PieLabelRenderProps) => {
  const { cx, cy, midAngle, innerRadius, outerRadius, percent } = props;
  if (
    cx === undefined || cy === undefined || midAngle === undefined ||
    innerRadius === undefined || outerRadius === undefined || percent === undefined
  ) return null;
  if ((percent as number) < 0.05) return null;
  const cxN = cx as number;
  const cyN = cy as number;
  const midN = midAngle as number;
  const inner = innerRadius as number;
  const outer = outerRadius as number;
  const pct = percent as number;
  const radius = inner + (outer - inner) * 0.5;
  const x = cxN + radius * Math.cos(-midN * RADIAN);
  const y = cyN + radius * Math.sin(-midN * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={11}
      fontWeight="600"
    >
      {`${(pct * 100).toFixed(0)}%`}
    </text>
  );
};

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
      <p
        className="mt-1 font-semibold tabular"
        style={{ color: "var(--fg-muted)" }}
      >
        {formatMoney(entry.value)}
      </p>
    </div>
  );
};

export function CategoryPie({ data, lang }: Props) {
  if (!data.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-3">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ background: "var(--surface-sunken)" }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--fg-subtle)" }}>
            <path d="M12 2v10l4.24 4.24"/>
            <circle cx="12" cy="12" r="10"/>
          </svg>
        </div>
        <p className="text-sm" style={{ color: "var(--fg-subtle)" }}>
          {t("analytics.empty", lang)}
        </p>
      </div>
    );
  }

  const pieData = data
    .filter((d) => d.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10)
    .map((d, i) => ({
      name: d.categoryName,
      value: d.amount,
      fill: COLORS[i % COLORS.length],
    }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={pieData}
          cx="50%"
          cy="50%"
          outerRadius={90}
          dataKey="value"
          labelLine={false}
          label={renderLabel}
        >
          {pieData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 11, color: "var(--fg-muted)" }}
          formatter={(value: string) => (
            <span style={{ color: "var(--fg-muted)" }}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
