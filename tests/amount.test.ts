import { describe, it, expect } from "vitest";
import { parseAmountUzs } from "../src/lib/claude/amount";

describe("parseAmountUzs", () => {
  // Basic multipliers (Uzbek)
  it('"500 ming" → 500000n', () => {
    expect(parseAmountUzs("500 ming")).toBe(500000n);
  });

  it('"500ming" (no space) → 500000n', () => {
    expect(parseAmountUzs("500ming")).toBe(500000n);
  });

  it('"2 mln" → 2000000n', () => {
    expect(parseAmountUzs("2 mln")).toBe(2000000n);
  });

  it('"2,5 mln" → 2500000n', () => {
    expect(parseAmountUzs("2,5 mln")).toBe(2500000n);
  });

  it('"500 000" (spaced thousands) → 500000n', () => {
    expect(parseAmountUzs("500 000")).toBe(500000n);
  });

  it('"yarim million" → 500000n', () => {
    expect(parseAmountUzs("yarim million")).toBe(500000n);
  });

  it('"1.5 million" → 1500000n', () => {
    expect(parseAmountUzs("1.5 million")).toBe(1500000n);
  });

  // Russian variants
  it('"500 тысяч" (ru) → 500000n', () => {
    expect(parseAmountUzs("500 тысяч")).toBe(500000n);
  });

  it('"2 млн" (ru) → 2000000n', () => {
    expect(parseAmountUzs("2 млн")).toBe(2000000n);
  });

  it('"2,5 млн" (ru) → 2500000n', () => {
    expect(parseAmountUzs("2,5 млн")).toBe(2500000n);
  });

  // English variants
  it('"300k" (en) → 300000n', () => {
    expect(parseAmountUzs("300k")).toBe(300000n);
  });

  it('"1.5 million" (en) → 1500000n', () => {
    expect(parseAmountUzs("1.5 million")).toBe(1500000n);
  });

  // Large number
  it('"1 mlrd" → 1000000000n', () => {
    expect(parseAmountUzs("1 mlrd")).toBe(1000000000n);
  });

  it('"3 000 000" (spaced millions) → 3000000n', () => {
    expect(parseAmountUzs("3 000 000")).toBe(3000000n);
  });

  // Sentence context
  it('extracts from sentence "logistika 150 ming chiqim" → 150000n', () => {
    expect(parseAmountUzs("logistika 150 ming chiqim")).toBe(150000n);
  });

  it('"sotuv 2 mln" → 2000000n', () => {
    expect(parseAmountUzs("sotuv 2 mln")).toBe(2000000n);
  });

  // Null cases
  it('returns null for empty string', () => {
    expect(parseAmountUzs("")).toBeNull();
  });

  it('returns null for non-numeric text', () => {
    expect(parseAmountUzs("salom dunyo")).toBeNull();
  });
});
