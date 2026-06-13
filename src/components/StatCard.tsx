interface StatCardProps {
  label: string;
  amount: string; // serialized BigInt string
  prevAmount: string;
  type?: "income" | "expense" | "net";
  comparisonLabel: string;
}

function formatAmount(val: bigint, type?: "income" | "expense" | "net"): string {
  const parts: string[] = [];
  let n = val < 0n ? -val : val;
  while (n >= 1000n) {
    parts.unshift(String(n % 1000n).padStart(3, "0"));
    n = n / 1000n;
  }
  parts.unshift(String(n));

  let sign = "";
  if (type === "income" && val !== 0n) sign = "+";
  if (type === "expense" && val !== 0n) sign = "-";
  if (type === "net" && val !== 0n) sign = val > 0n ? "+" : "-";

  return sign + parts.join(" ") + " so'm";
}

function formatDelta(
  current: bigint,
  prev: bigint,
  type?: "income" | "expense" | "net"
): { text: string; good: boolean } | null {
  if (prev === 0n) return null;
  const diff = current - prev;
  const base = prev < 0n ? -prev : prev;
  const pct = Math.round(Number((diff * 100n) / base));
  const sign = diff >= 0n ? "+" : "";
  const good = type === "expense" ? diff <= 0n : diff >= 0n;
  return { text: `${sign}${pct}%`, good };
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
  const delta = formatDelta(current, prev, type);

  const amountColor =
    type === "income"
      ? "var(--income)"
      : type === "expense"
        ? "var(--expense)"
        : type === "net"
          ? current >= 0n
            ? "var(--income)"
            : "var(--expense)"
          : "var(--fg)";

  return (
    <div
      className="rounded-[10px] p-6 flex flex-col gap-1"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      <p
        className="text-xs font-medium uppercase tracking-wide"
        style={{ color: "var(--fg-subtle)" }}
      >
        {label}
      </p>
      <p
        className="text-[28px] font-semibold tabular leading-tight mt-1"
        style={{ color: amountColor }}
      >
        {formatAmount(current, type)}
      </p>
      {delta && (
        <p
          className="text-xs font-medium flex items-center gap-1 mt-0.5"
          style={{
            color: delta.good
              ? "var(--income)"
              : "var(--expense)",
          }}
        >
          {delta.good ? "▲" : "▼"} {delta.text}
          <span
            style={{ color: "var(--fg-muted)", fontWeight: 400 }}
          >
            {comparisonLabel}
          </span>
        </p>
      )}
    </div>
  );
}
