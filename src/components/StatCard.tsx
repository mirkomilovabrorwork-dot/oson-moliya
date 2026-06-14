interface StatCardProps {
  label: string;
  amount: string; // serialized BigInt string
  prevAmount: string;
  type?: "income" | "expense" | "net";
  comparisonLabel: string;
  noPrevLabel?: string;
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

/**
 * Computes a period-over-period delta with all financial guards:
 * - prev === 0n  → null (no-data, caller shows noPrevLabel)
 * - sign change  → null (% over sign-change is meaningless; caller shows abs-move)
 * - same sign    → integer %, clamped to ">999%" if absurd
 * - direction    → income/net up = good; expense up = bad
 *
 * Returns { text, good, signChange } where signChange signals
 * the caller should render an absolute-move line instead.
 */
export function formatDelta(
  current: bigint,
  prev: bigint,
  type?: "income" | "expense" | "net"
): { text: string; good: boolean; signChange: boolean; noPrev: boolean } | null {
  // Guard: no previous-period data at all
  if (prev === 0n) return { text: "", good: true, signChange: false, noPrev: true };

  // Guard: sign change — economically meaningless %
  const sameSign = (current >= 0n) === (prev >= 0n);
  if (!sameSign) {
    return { text: "", good: current > prev, signChange: true, noPrev: false };
  }

  const diff = current - prev;
  const base = prev < 0n ? -prev : prev;
  const rawPct = Number((diff * 100n) / base);
  const absPct = Math.abs(rawPct);
  const sign = diff >= 0n ? "+" : "";
  const pctStr = absPct > 999 ? `${sign}>999%` : `${sign}${Math.round(rawPct)}%`;

  // Direction: income/net higher = good; expense higher = bad
  const good = type === "expense" ? diff <= 0n : diff >= 0n;

  return { text: pctStr, good, signChange: false, noPrev: false };
}

export function StatCard({
  label,
  amount,
  prevAmount,
  type,
  comparisonLabel,
  noPrevLabel,
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
      {delta && delta.noPrev && noPrevLabel && (
        <p className="text-xs font-medium mt-0.5" style={{ color: "var(--fg-subtle)" }}>
          {noPrevLabel}
        </p>
      )}
      {delta && !delta.noPrev && delta.signChange && (
        <p className="text-xs font-medium mt-0.5" style={{ color: "var(--fg-muted)" }}>
          {/* absolute move shown by parent via comparisonLabel slot — here just neutral */}
          {comparisonLabel}
        </p>
      )}
      {delta && !delta.noPrev && !delta.signChange && delta.text && (
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
