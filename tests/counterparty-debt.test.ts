/**
 * Unit tests for the pure sumByDirection helper (no DB, no I/O).
 * getCounterpartyDebt is async + needs a DB so it is NOT tested here;
 * its correctness follows from sumByDirection + matchOpenDebts (already tested).
 */

import { describe, it, expect } from "vitest";
import { sumByDirection, type CounterpartyDebtMatch } from "@/lib/services/debts";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMatch(
  direction: "given" | "taken",
  remaining: bigint,
  id = "id_" + Math.random().toString(36).slice(2)
): CounterpartyDebtMatch {
  return { id, direction, remaining, counterparty: "Test" };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("sumByDirection", () => {
  it("empty list → 0n / 0n", () => {
    const { givenRemaining, takenRemaining } = sumByDirection([]);
    expect(givenRemaining).toBe(0n);
    expect(takenRemaining).toBe(0n);
  });

  it("single given debt → correct givenRemaining, takenRemaining=0n", () => {
    const { givenRemaining, takenRemaining } = sumByDirection([
      makeMatch("given", 500_000n),
    ]);
    expect(givenRemaining).toBe(500_000n);
    expect(takenRemaining).toBe(0n);
  });

  it("single taken debt → givenRemaining=0n, correct takenRemaining", () => {
    const { givenRemaining, takenRemaining } = sumByDirection([
      makeMatch("taken", 300_000n),
    ]);
    expect(givenRemaining).toBe(0n);
    expect(takenRemaining).toBe(300_000n);
  });

  it("mixed given + taken → sums each direction independently", () => {
    const { givenRemaining, takenRemaining } = sumByDirection([
      makeMatch("given", 1_000_000n),
      makeMatch("taken", 200_000n),
      makeMatch("given", 500_000n),
      makeMatch("taken", 50_000n),
    ]);
    expect(givenRemaining).toBe(1_500_000n);
    expect(takenRemaining).toBe(250_000n);
  });

  it("multiple given only → sums all, takenRemaining=0n", () => {
    const { givenRemaining, takenRemaining } = sumByDirection([
      makeMatch("given", 100n),
      makeMatch("given", 200n),
      makeMatch("given", 300n),
    ]);
    expect(givenRemaining).toBe(600n);
    expect(takenRemaining).toBe(0n);
  });

  it("multiple taken only → givenRemaining=0n, sums all", () => {
    const { givenRemaining, takenRemaining } = sumByDirection([
      makeMatch("taken", 100n),
      makeMatch("taken", 900n),
    ]);
    expect(givenRemaining).toBe(0n);
    expect(takenRemaining).toBe(1_000n);
  });

  it("large BigInt values do not overflow", () => {
    // 10 trillion so'm each
    const big = 10_000_000_000_000n;
    const { givenRemaining, takenRemaining } = sumByDirection([
      makeMatch("given", big),
      makeMatch("given", big),
      makeMatch("taken", big),
    ]);
    expect(givenRemaining).toBe(20_000_000_000_000n);
    expect(takenRemaining).toBe(big);
  });
});
