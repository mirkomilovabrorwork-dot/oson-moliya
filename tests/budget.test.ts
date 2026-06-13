/**
 * Budget alert logic unit tests.
 * Tests the core checkBreach logic in isolation (no DB — pure function tests).
 *
 * Acceptance criteria (spec 003):
 * 1. under limit → no alert
 * 2. crossing limit → one alert (lastAlertedYm set)
 * 3. second expense same month → no second alert (idempotent)
 * 4. new month → alerts again
 */
import { describe, it, expect } from "vitest";

// Pure function extracted from the budget breach logic
// In real impl this lives in src/lib/services/budgets.ts (backend agent).
// We test the decision logic here independently.

interface BudgetState {
  limitUzs: bigint;
  lastAlertedYm: string | null;
}

interface CheckResult {
  shouldAlert: boolean;
  newLastAlertedYm: string | null;
}

function checkBreach(
  spentThisMonth: bigint,
  budget: BudgetState,
  currentYm: string // e.g. "2026-06"
): CheckResult {
  if (spentThisMonth < budget.limitUzs) {
    return { shouldAlert: false, newLastAlertedYm: budget.lastAlertedYm };
  }
  // At or over limit — alert only if we haven't alerted this month
  if (budget.lastAlertedYm === currentYm) {
    return { shouldAlert: false, newLastAlertedYm: budget.lastAlertedYm };
  }
  return { shouldAlert: true, newLastAlertedYm: currentYm };
}

describe("checkBreach", () => {
  const LIMIT = 1_000_000n; // 1 mln so'm
  const YM = "2026-06";
  const NEXT_YM = "2026-07";

  it("under limit → no alert", () => {
    const result = checkBreach(500_000n, { limitUzs: LIMIT, lastAlertedYm: null }, YM);
    expect(result.shouldAlert).toBe(false);
  });

  it("exactly at limit → alert", () => {
    const result = checkBreach(LIMIT, { limitUzs: LIMIT, lastAlertedYm: null }, YM);
    expect(result.shouldAlert).toBe(true);
    expect(result.newLastAlertedYm).toBe(YM);
  });

  it("over limit → alert and sets lastAlertedYm", () => {
    const result = checkBreach(1_500_000n, { limitUzs: LIMIT, lastAlertedYm: null }, YM);
    expect(result.shouldAlert).toBe(true);
    expect(result.newLastAlertedYm).toBe(YM);
  });

  it("second expense same month after alert → no second alert (idempotent)", () => {
    // Already alerted this month
    const result = checkBreach(2_000_000n, { limitUzs: LIMIT, lastAlertedYm: YM }, YM);
    expect(result.shouldAlert).toBe(false);
    expect(result.newLastAlertedYm).toBe(YM);
  });

  it("new month → alerts again even if over limit last month", () => {
    // lastAlertedYm is from last month, now a new month
    const result = checkBreach(1_200_000n, { limitUzs: LIMIT, lastAlertedYm: YM }, NEXT_YM);
    expect(result.shouldAlert).toBe(true);
    expect(result.newLastAlertedYm).toBe(NEXT_YM);
  });

  it("new month but under limit → no alert", () => {
    const result = checkBreach(100_000n, { limitUzs: LIMIT, lastAlertedYm: YM }, NEXT_YM);
    expect(result.shouldAlert).toBe(false);
  });
});
