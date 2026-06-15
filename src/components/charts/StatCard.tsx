"use client";

/**
 * StatCard — a clean KPI tile used across Analytics and Home.
 * Accepts a pre-formatted amount string so currency formatting
 * is owned by the parent (no hardcoded suffix here).
 */

interface Props {
  label: string;
  value: string;
  valueColor?: string;
  subtext?: string;
  subtextColor?: string;
}

export function StatCard({ label, value, valueColor, subtext, subtextColor }: Props) {
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-1 min-w-0"
      style={{
        background: "var(--surface-elevated)",
        border: "1px solid var(--border)",
      }}
    >
      <p
        className="text-[11px] font-semibold uppercase tracking-widest truncate"
        style={{ color: "var(--fg-subtle)" }}
      >
        {label}
      </p>
      <p
        className="text-xl font-bold tabular leading-snug break-words"
        style={{ color: valueColor ?? "var(--fg)" }}
      >
        {value}
      </p>
      {subtext && (
        <p
          className="text-[11px] tabular"
          style={{ color: subtextColor ?? "var(--fg-subtle)" }}
        >
          {subtext}
        </p>
      )}
    </div>
  );
}
