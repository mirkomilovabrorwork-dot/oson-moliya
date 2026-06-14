import { describe, it, expect } from "vitest";
import { formatDelta } from "@/components/StatCard";

describe("formatDelta guard rules", () => {
  // Rule 1: prev === 0 → noPrev flag, never % or Infinity
  it("prev=0: returns noPrev=true", () => {
    const result = formatDelta(500000n, 0n, "income");
    expect(result).not.toBeNull();
    expect(result!.noPrev).toBe(true);
    expect(result!.text).toBe("");
  });

  it("prev=0 expense: returns noPrev=true, not NaN/Infinity", () => {
    const result = formatDelta(0n, 0n, "expense");
    expect(result).not.toBeNull();
    expect(result!.noPrev).toBe(true);
  });

  // Rule 2: sign change → signChange=true, no %
  it("net sign change (negative → positive): signChange=true", () => {
    const result = formatDelta(500000n, -200000n, "net");
    expect(result).not.toBeNull();
    expect(result!.signChange).toBe(true);
    expect(result!.text).toBe("");
  });

  it("net sign change (positive → negative): signChange=true", () => {
    const result = formatDelta(-100000n, 300000n, "net");
    expect(result).not.toBeNull();
    expect(result!.signChange).toBe(true);
  });

  // Rule 3: same sign → show %, clamped to >999%
  it("income up 50%: good=true, text=+50%", () => {
    const result = formatDelta(1500000n, 1000000n, "income");
    expect(result).not.toBeNull();
    expect(result!.noPrev).toBe(false);
    expect(result!.signChange).toBe(false);
    expect(result!.text).toBe("+50%");
    expect(result!.good).toBe(true);
  });

  it("expense up (bad): good=false", () => {
    const result = formatDelta(2000000n, 1000000n, "expense");
    expect(result).not.toBeNull();
    expect(result!.good).toBe(false);
    expect(result!.text).toBe("+100%");
  });

  it("expense down (good): good=true", () => {
    const result = formatDelta(500000n, 1000000n, "expense");
    expect(result).not.toBeNull();
    expect(result!.good).toBe(true);
    expect(result!.text).toBe("-50%");
  });

  // Rule 4: net direction — net higher = good, NOT based on raw diff sign
  it("net positive and rising: good=true", () => {
    const result = formatDelta(1000000n, 500000n, "net");
    expect(result).not.toBeNull();
    expect(result!.good).toBe(true);
  });

  it("net negative and worsening (more negative): good=false", () => {
    // Both negative: current = -2M, prev = -1M → diff = -1M (worse)
    const result = formatDelta(-2000000n, -1000000n, "net");
    expect(result).not.toBeNull();
    expect(result!.signChange).toBe(false);
    // net type: good = diff >= 0n → false (diff is -1M)
    expect(result!.good).toBe(false);
  });

  // Rule 5: clamp >999%
  it("absurd % clamped to >999%", () => {
    const result = formatDelta(100000000n, 10000n, "income");
    expect(result).not.toBeNull();
    expect(result!.text).toBe("+>999%");
  });

  // Rule 6: integer rounding
  it("percent is integer", () => {
    const result = formatDelta(1333333n, 1000000n, "income");
    expect(result).not.toBeNull();
    // 33.3% → 33%
    expect(result!.text).toBe("+33%");
  });
});
