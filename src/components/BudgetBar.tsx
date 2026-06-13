import type { BudgetDTO } from "@/lib/types";
import type { LangCode } from "@/lib/i18n/translate";
import { t } from "@/lib/i18n/translate";

function formatMoney(s: string): string {
  const n = Number(s);
  if (isNaN(n)) return s;
  const parts: string[] = [];
  let rem = Math.abs(Math.round(n));
  while (rem >= 1000) {
    parts.unshift(String(rem % 1000).padStart(3, "0"));
    rem = Math.floor(rem / 1000);
  }
  parts.unshift(String(rem));
  return parts.join(" "); // narrow no-break space
}

interface BudgetBarProps {
  budget: BudgetDTO;
  lang: LangCode;
  compact?: boolean;
}

export function BudgetBar({ budget, lang, compact = false }: BudgetBarProps) {
  const pct = Math.min(budget.percent, 100);
  const over = budget.percent >= 100;
  const warn = budget.percent >= 70;

  const barColor = over
    ? "var(--color-budget-over)"
    : warn
    ? "var(--color-budget-warn)"
    : "var(--color-budget-ok)";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-xs font-medium truncate"
          style={{ color: "var(--color-text-secondary)", maxWidth: compact ? 120 : undefined }}
          title={budget.categoryName}
        >
          {budget.categoryName}
        </span>
        <span
          className="text-xs tabular shrink-0"
          style={{ color: over ? "var(--color-expense)" : "var(--color-text-secondary)" }}
        >
          {formatMoney(budget.spentUzs)} / {formatMoney(budget.limitUzs)} so'm
          {over && <span className="ml-1 font-semibold">⚠</span>}
        </span>
      </div>
      <div
        className="h-2 rounded-full overflow-hidden"
        style={{ background: "var(--color-border)" }}
        role="progressbar"
        aria-valuenow={budget.percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: barColor }}
        />
      </div>
      {!compact && (
        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          {over
            ? t("budget.over", lang)
            : `${budget.percent}% ${t("budget.spent", lang)}`}
        </p>
      )}
    </div>
  );
}
