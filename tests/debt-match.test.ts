/**
 * Unit tests for the pure matchOpenDebts function.
 * No I/O, no DB, no Anthropic calls — pure logic only.
 */

import { describe, it, expect } from "vitest";
import { matchOpenDebts, type MatchableDebt } from "@/lib/services/debtMatch";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeDebt(
  overrides: Partial<MatchableDebt> & Pick<MatchableDebt, "counterparty" | "direction">
): MatchableDebt {
  return {
    id: overrides.id ?? "cuid_" + Math.random().toString(36).slice(2),
    remaining: overrides.remaining ?? 1000000n,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("matchOpenDebts", () => {
  it("exact normalized name (case/space-insensitive) → one", () => {
    const open: MatchableDebt[] = [
      makeDebt({ counterparty: "Sarvar", direction: "given" }),
    ];
    const result = matchOpenDebts(open, "sarvar", null);
    expect(result.status).toBe("one");
    expect(result.matches).toHaveLength(1);
  });

  it("case-insensitive with extra whitespace → one", () => {
    const open: MatchableDebt[] = [
      makeDebt({ counterparty: "Akbar  Toshmatov", direction: "taken" }),
    ];
    const result = matchOpenDebts(open, "akbar toshmatov", null);
    expect(result.status).toBe("one");
  });

  it("no match → none", () => {
    const open: MatchableDebt[] = [
      makeDebt({ counterparty: "Sarvar", direction: "given" }),
    ];
    const result = matchOpenDebts(open, "Bobur", null);
    expect(result.status).toBe("none");
    expect(result.matches).toHaveLength(0);
  });

  it("substring fuzzy: query shorter than stored name → one", () => {
    // "Sarvar" should match stored "Sarvarbek"
    const open: MatchableDebt[] = [
      makeDebt({ counterparty: "Sarvarbek", direction: "given" }),
    ];
    const result = matchOpenDebts(open, "Sarvar", null);
    expect(result.status).toBe("one");
  });

  it("substring fuzzy: stored name shorter than query → one", () => {
    // "Sarvar" is stored; query is "Sarvarbek" which includes "sarvar"
    const open: MatchableDebt[] = [
      makeDebt({ counterparty: "Sarvar", direction: "given" }),
    ];
    const result = matchOpenDebts(open, "Sarvarbek", null);
    expect(result.status).toBe("one");
  });

  it("two open debts with same name and direction → many", () => {
    const open: MatchableDebt[] = [
      makeDebt({ id: "id1", counterparty: "Sarvar", direction: "given", remaining: 500000n }),
      makeDebt({ id: "id2", counterparty: "Sarvar", direction: "given", remaining: 300000n }),
    ];
    const result = matchOpenDebts(open, "Sarvar", null);
    expect(result.status).toBe("many");
    expect(result.matches).toHaveLength(2);
  });

  it("direction filter: same name in both directions, direction='given' → only the given one", () => {
    const open: MatchableDebt[] = [
      makeDebt({ id: "given1", counterparty: "Sarvar", direction: "given", remaining: 500000n }),
      makeDebt({ id: "taken1", counterparty: "Sarvar", direction: "taken", remaining: 300000n }),
    ];
    const result = matchOpenDebts(open, "Sarvar", "given");
    expect(result.status).toBe("one");
    expect(result.matches[0].id).toBe("given1");
  });

  it("direction filter: direction='taken' → only the taken debt", () => {
    const open: MatchableDebt[] = [
      makeDebt({ id: "given1", counterparty: "Sarvar", direction: "given", remaining: 500000n }),
      makeDebt({ id: "taken1", counterparty: "Sarvar", direction: "taken", remaining: 300000n }),
    ];
    const result = matchOpenDebts(open, "Sarvar", "taken");
    expect(result.status).toBe("one");
    expect(result.matches[0].id).toBe("taken1");
  });

  it("remaining <= 0 excluded (defensive check even when caller filtered)", () => {
    const open: MatchableDebt[] = [
      makeDebt({ counterparty: "Sarvar", direction: "given", remaining: 0n }),
      makeDebt({ counterparty: "Sarvar", direction: "given", remaining: -100n }),
    ];
    const result = matchOpenDebts(open, "Sarvar", null);
    expect(result.status).toBe("none");
  });

  it("empty counterparty → none", () => {
    const open: MatchableDebt[] = [
      makeDebt({ counterparty: "Sarvar", direction: "given" }),
    ];
    const result = matchOpenDebts(open, "", null);
    expect(result.status).toBe("none");
  });

  it("whitespace-only counterparty → none", () => {
    const open: MatchableDebt[] = [
      makeDebt({ counterparty: "Sarvar", direction: "given" }),
    ];
    const result = matchOpenDebts(open, "   ", null);
    expect(result.status).toBe("none");
  });

  it("empty open list → none", () => {
    const result = matchOpenDebts([], "Sarvar", null);
    expect(result.status).toBe("none");
  });

  it("null direction filter → matches either direction", () => {
    const open: MatchableDebt[] = [
      makeDebt({ id: "g", counterparty: "Sarvar", direction: "given", remaining: 100n }),
      makeDebt({ id: "t", counterparty: "Sarvar", direction: "taken", remaining: 200n }),
    ];
    const result = matchOpenDebts(open, "Sarvar", null);
    expect(result.status).toBe("many");
    expect(result.matches).toHaveLength(2);
  });
});
