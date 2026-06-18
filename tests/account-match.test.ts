/**
 * Unit tests for the pure matchAccountByName function.
 * No I/O, no DB — pure logic only.
 */

import { describe, it, expect } from "vitest";
import { matchAccountByName } from "@/lib/services/accounts";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeAccount(id: string, name: string): { id: string; name: string } {
  return { id, name };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("matchAccountByName", () => {
  it("exact match (case-insensitive) → one", () => {
    const accounts = [makeAccount("a1", "Hamkor karta")];
    const result = matchAccountByName(accounts, "hamkor karta");
    expect(result.status).toBe("one");
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].id).toBe("a1");
  });

  it("exact match ignores surrounding whitespace → one", () => {
    const accounts = [makeAccount("a1", "  Naqd  ")];
    const result = matchAccountByName(accounts, "naqd");
    expect(result.status).toBe("one");
  });

  it("exact match collapses internal whitespace → one", () => {
    const accounts = [makeAccount("a1", "Hamkor  karta")];
    const result = matchAccountByName(accounts, "hamkor karta");
    expect(result.status).toBe("one");
  });

  it("substring: query is contained in stored name → one", () => {
    // "karta" is a substring of "Hamkor karta"
    const accounts = [makeAccount("a1", "Hamkor karta")];
    const result = matchAccountByName(accounts, "karta");
    expect(result.status).toBe("one");
  });

  it("substring: stored name is contained in query → one", () => {
    // stored "Naqd" is a substring of query "Naqd pul"
    const accounts = [makeAccount("a1", "Naqd")];
    const result = matchAccountByName(accounts, "Naqd pul");
    expect(result.status).toBe("one");
  });

  it("no match → none", () => {
    const accounts = [makeAccount("a1", "Hamkor karta"), makeAccount("a2", "Naqd")];
    const result = matchAccountByName(accounts, "Ipak yo'li");
    expect(result.status).toBe("none");
    expect(result.matches).toHaveLength(0);
  });

  it("two accounts with identical normalized name → many", () => {
    const accounts = [
      makeAccount("a1", "Naqd"),
      makeAccount("a2", "NAQD"),
    ];
    const result = matchAccountByName(accounts, "naqd");
    expect(result.status).toBe("many");
    expect(result.matches).toHaveLength(2);
  });

  it("two accounts both matching by substring → many", () => {
    const accounts = [
      makeAccount("a1", "Hamkor karta"),
      makeAccount("a2", "Ipoteka karta"),
    ];
    const result = matchAccountByName(accounts, "karta");
    expect(result.status).toBe("many");
    expect(result.matches).toHaveLength(2);
  });

  it("empty name → none", () => {
    const accounts = [makeAccount("a1", "Naqd")];
    const result = matchAccountByName(accounts, "");
    expect(result.status).toBe("none");
    expect(result.matches).toHaveLength(0);
  });

  it("whitespace-only name → none", () => {
    const accounts = [makeAccount("a1", "Naqd")];
    const result = matchAccountByName(accounts, "   ");
    expect(result.status).toBe("none");
  });

  it("empty accounts list → none", () => {
    const result = matchAccountByName([], "Naqd");
    expect(result.status).toBe("none");
  });

  it("exact match takes priority over substring when both would apply", () => {
    // "karta" would be a substring of "Hamkor karta", but "karta" exact-matches
    // an account named exactly "karta" — should return one (the exact match).
    const accounts = [
      makeAccount("a1", "Hamkor karta"),
      makeAccount("a2", "karta"),
    ];
    const result = matchAccountByName(accounts, "karta");
    // exact match step finds a2 only (norm("karta") === norm("karta"))
    expect(result.status).toBe("one");
    expect(result.matches[0].id).toBe("a2");
  });
});
