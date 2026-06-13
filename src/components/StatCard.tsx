interface StatCardProps {
  label: string;
  amount: string; // pre-formatted BigInt string
  prevAmount: string;
  type?: "income" | "expense" | "net";
  comparisonLabel: string;
}

function formatChange(current: bigint, prev: bigint): { text: string; positive: boolean } {
  if (prev === 0n) return { text: "", positive: true };
  const diff = current - prev;
  const pct = Math.round(Number((diff * 100n) / prev));
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
  const currentBig = BigInt(amount);
  const prevBig = BigInt(prevAmount);
  const change = formatChange(currentBig, prevBig);

  const colorClass =
    type === "income"
      ? "text-green-600"
      : type === "expense"
      ? "text-red-500"
      : type === "net"
      ? currentBig >= 0n
        ? "text-blue-600"
        : "text-red-500"
      : "text-gray-800";

  const formatted = currentBig.toLocaleString("uz-UZ") + " so'm";

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <p className="text-sm text-gray-500 font-medium mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colorClass}`}>{formatted}</p>
      {change.text && (
        <p className={`text-xs mt-1 ${change.positive ? "text-green-600" : "text-red-500"}`}>
          {change.text} {comparisonLabel}
        </p>
      )}
    </div>
  );
}
