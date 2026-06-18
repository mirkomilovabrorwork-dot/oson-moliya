import { describe, it, expect } from "vitest";
import { evalCostlyCap, COSTLY_DAILY_CAP } from "../src/lib/telegram/costlyCap";

const TODAY = "2026-06-18";
const YESTERDAY = "2026-06-17";

describe("evalCostlyCap", () => {
  it("same day, under cap → allowed, count increments by 1", () => {
    const result = evalCostlyCap({ ymd: TODAY, count: 5 }, TODAY);
    expect(result.allowed).toBe(true);
    expect(result.next).toEqual({ ymd: TODAY, count: 6 });
  });

  it("same day, at cap → NOT allowed, count unchanged", () => {
    const result = evalCostlyCap({ ymd: TODAY, count: COSTLY_DAILY_CAP }, TODAY);
    expect(result.allowed).toBe(false);
    expect(result.next).toEqual({ ymd: TODAY, count: COSTLY_DAILY_CAP });
  });

  it("new day → allowed, count resets to 1, ymd = today", () => {
    const result = evalCostlyCap({ ymd: YESTERDAY, count: 79 }, TODAY);
    expect(result.allowed).toBe(true);
    expect(result.next).toEqual({ ymd: TODAY, count: 1 });
  });

  it("null ymd (first ever costly op) → allowed, count = 1, ymd = today", () => {
    const result = evalCostlyCap({ ymd: null, count: 0 }, TODAY);
    expect(result.allowed).toBe(true);
    expect(result.next).toEqual({ ymd: TODAY, count: 1 });
  });

  it("custom small cap boundary: 0→1→2 allowed, 3rd blocked", () => {
    const cap = 2;

    const r0 = evalCostlyCap({ ymd: TODAY, count: 0 }, TODAY, cap);
    expect(r0.allowed).toBe(true);
    expect(r0.next.count).toBe(1);

    const r1 = evalCostlyCap({ ymd: TODAY, count: 1 }, TODAY, cap);
    expect(r1.allowed).toBe(true);
    expect(r1.next.count).toBe(2);

    const r2 = evalCostlyCap({ ymd: TODAY, count: 2 }, TODAY, cap);
    expect(r2.allowed).toBe(false);
    expect(r2.next.count).toBe(2);
  });
});
