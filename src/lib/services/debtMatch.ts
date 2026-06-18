import type { DebtDirection } from "@prisma/client";

export interface MatchableDebt {
  id: string;
  counterparty: string;
  direction: DebtDirection; // "given" | "taken"
  remaining: bigint;
}

export interface DebtMatchResult {
  status: "none" | "one" | "many";
  matches: MatchableDebt[];
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Match open debts for a repayment by counterparty (+ optional direction).
 * Strategy: filter by direction (if given) → exact normalized name; if none, substring either-way.
 * Only debts with remaining>0 are considered (caller already filters, but be defensive).
 */
export function matchOpenDebts(
  open: MatchableDebt[],
  counterparty: string,
  direction: DebtDirection | null
): DebtMatchResult {
  const pool = open
    .filter((d) => d.remaining > 0n)
    .filter((d) => (direction ? d.direction === direction : true));
  const q = norm(counterparty);
  if (!q) return { status: "none", matches: [] };

  let hits = pool.filter((d) => norm(d.counterparty) === q);
  if (hits.length === 0) {
    hits = pool.filter((d) => {
      const n = norm(d.counterparty);
      return n.includes(q) || q.includes(n);
    });
  }
  if (hits.length === 0) return { status: "none", matches: [] };
  if (hits.length === 1) return { status: "one", matches: hits };
  return { status: "many", matches: hits };
}
