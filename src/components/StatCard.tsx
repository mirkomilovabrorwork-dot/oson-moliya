interface StatCardProps {
  label: string;
  amount: string; // serialized BigInt string
  prevAmount: string;
  type?: "income" | "expense" | "net";
  comparisonLabel: string;
}

function formatAmount(val: bigint): string {
  const parts: string[] = [];
  let n = val < 0n ? -val : val;
  while (n >= 1000n) {
    parts.unshift(String(n % 1000n).padStart(3, "0"));
    n = n / 1000n;
  }
  parts.unshift(String(n));
  return (val < 0n ? "−" : "") + parts.join(" ") + " so'm";
}

function formatDelta(
  current: bigint,
  prev: bigint
): { text: string; positive: boolean } | null {
  if (prev === 0n) return null;
  const diff = current - prev;
  const base = prev < 0n ? -prev : prev;
  const pct = Math.round(Number((diff * 100n) / base));
  const sign = diff >= 0n ? "+" : "";
  return { text: `${sign}${pct}%`, positive: diff >= 0n };
}

export function StatCard({
  label,
  amount,
  prevAmount,
  type,
  comparisonLabel,
}: StatCardProps) {
  const current = BigInt(amount);
  const prev = BigInt(prevAmount);
  const delta = formatDelta(current, prev);

  const amountColor =
    type === "income"
      ? "var(--color-income)"
      : type === "expense"
        ? "var(--color-expense)"
        : type === "net"
          ? current >= 0n
            ? "var(--color-income)"
            : "var(--color-expense)"
          : "var(--color-text-primary)";

  const icon =
    type === "income" ? "↑" : type === "expense" ? "↓" : "≈";

  return (
    <div
      className="rounded-xl p-5 shadow-sm flex flex-col gap-1"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="flex items-center justify-between">
        <p
          className="text-xs font-medium"
          style={{ color: "var(--color-text-muted)" }}
        >
          {label}
        </p>
        <span
          className="text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full"
          style={
            type === "income"
              ? {
                  background: "var(--color-income-bg)",
                  color: "var(--color-income)",
                }
              : type === "expense"
                ? {
                    background: "var(--color-expense-bg)",
                    color: "var(--color-expense)",
                  }
                : {
                    background: "var(--color-brand-light)",
                    color: "var(--color-brand)",
                  }
          }
        >
          {icon}
        </span>
      </div>
      <p
        className="text-2xl font-bold tabular leading-tight"
        style={{ color: amountColor }}
      >
        {formatAmount(current)}
      </p>
      {delta && (
        <p
          className="text-xs font-medium flex items-center gap-1"
          style={{
            color: delta.positive
              ? "var(--color-income)"
              : "var(--color-expense)",
          }}
        >
          {delta.positive ? "▲" : "▼"} {delta.text}
          <span
            style={{ color: "var(--color-text-muted)", fontWeight: 400 }}
          >
            {comparisonLabel}
          </span>
        </p>
      )}
    </div>
  );
}
