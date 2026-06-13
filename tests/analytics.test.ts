/**
 * Analytics aggregation tests.
 * These tests use an in-memory mock Prisma to verify pure period-math logic
 * and the runAggregation function without a live DB.
 *
 * The test also verifies Asia/Tashkent boundary math directly.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Period math helpers (extracted from analytics.ts via re-export for tests) ─

// We can't easily import analytics.ts directly without a real DB, so we test
// the period-math through a thin local copy + test runAggregation with a mocked db.

// Replicate the helpers exactly as in analytics.ts for unit-testing the period math.
function tashkentNowFixed(fixedMs: number) {
  return new Date(fixedMs + 5 * 60 * 60 * 1000);
}

function tashkentDateToUtcStart(
  yyyy: number,
  mm: number,
  dd: number
): Date {
  return new Date(Date.UTC(yyyy, mm - 1, dd) - 5 * 60 * 60 * 1000);
}

function tashkentMonthStart(year: number, month: number): Date {
  return tashkentDateToUtcStart(year, month, 1);
}

function tashkentMonthEnd(year: number, month: number): Date {
  if (month === 12) return tashkentMonthStart(year + 1, 1);
  return tashkentMonthStart(year, month + 1);
}

// ── Period math tests ─────────────────────────────────────────────────────────

describe("Asia/Tashkent period math", () => {
  it("Tashkent month start for 2025-06 is UTC 2025-05-31T19:00:00Z", () => {
    const start = tashkentMonthStart(2025, 6);
    // June 1 00:00 Tashkent = May 31 19:00 UTC
    expect(start.toISOString()).toBe("2025-05-31T19:00:00.000Z");
  });

  it("Tashkent month end for 2025-06 is UTC 2025-06-30T19:00:00Z", () => {
    const end = tashkentMonthEnd(2025, 6);
    // July 1 00:00 Tashkent = June 30 19:00 UTC
    expect(end.toISOString()).toBe("2025-06-30T19:00:00.000Z");
  });

  it("Tashkent today start: a UTC timestamp at 20:00 on 2025-06-13 falls in June 14 Tashkent", () => {
    // 2025-06-13T20:00:00Z → Tashkent 2025-06-14 01:00 → Tashkent date = June 14
    const utcMs = Date.UTC(2025, 5, 13, 20, 0, 0); // June 13 20:00 UTC
    const tashkent = tashkentNowFixed(utcMs);
    const tashkentDate = tashkent.getUTCDate(); // 14
    const tashkentMonth = tashkent.getUTCMonth() + 1; // 6
    const tashkentYear = tashkent.getUTCFullYear(); // 2025
    const dayStart = tashkentDateToUtcStart(tashkentYear, tashkentMonth, tashkentDate);
    // June 14 00:00 Tashkent = June 13 19:00 UTC
    expect(dayStart.toISOString()).toBe("2025-06-13T19:00:00.000Z");
  });

  it("December month-end wraps to next year correctly", () => {
    const end = tashkentMonthEnd(2025, 12);
    // Jan 1 2026 00:00 Tashkent = Dec 31 2025 19:00 UTC
    expect(end.toISOString()).toBe("2025-12-31T19:00:00.000Z");
  });
});

// ── runAggregation with mocked Prisma ─────────────────────────────────────────

// We mock the db module so runAggregation runs without a real database.
const mockAggregate = vi.fn();
const mockGroupBy = vi.fn();
const mockCategoryFindFirst = vi.fn();
const mockCategoryFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  db: new Proxy({} as import("@prisma/client").PrismaClient, {
    get(_target, prop) {
      if (prop === "transaction") {
        return {
          aggregate: mockAggregate,
          groupBy: mockGroupBy,
        };
      }
      if (prop === "category") {
        return {
          findFirst: mockCategoryFindFirst,
          findMany: mockCategoryFindMany,
        };
      }
      return undefined;
    },
  }),
}));

import { runAggregation } from "@/lib/services/analytics";

const userId = "test-user-1";

beforeEach(() => {
  vi.clearAllMocks();
  mockCategoryFindFirst.mockResolvedValue(null);
  mockCategoryFindMany.mockResolvedValue([]);
});

describe("runAggregation — sum", () => {
  it("returns formatted sum for income this_month", async () => {
    mockAggregate.mockResolvedValue({ _sum: { amountUzs: 1_500_000n } });
    const result = await runAggregation(
      userId,
      { metric: "sum", type: "income", period: "this_month" },
      "uz"
    );
    expect(result.data.sum).toBe("1500000");
    expect(result.text).toContain("so'm");
    expect(result.text).toContain("1 500 000");
  });

  it("handles zero sum gracefully", async () => {
    mockAggregate.mockResolvedValue({ _sum: { amountUzs: null } });
    const result = await runAggregation(
      userId,
      { metric: "sum", period: "today" },
      "en"
    );
    expect(result.data.sum).toBe("0");
    expect(result.text).toContain("0 so'm");
  });
});

describe("runAggregation — count", () => {
  it("returns count", async () => {
    mockAggregate.mockResolvedValue({ _count: 7, _sum: {} });
    const result = await runAggregation(
      userId,
      { metric: "count", period: "this_week" },
      "ru"
    );
    expect(result.data.count).toBe(7);
    expect(result.text).toContain("7");
  });
});

describe("runAggregation — net", () => {
  it("returns income, expense, net", async () => {
    mockAggregate
      .mockResolvedValueOnce({ _sum: { amountUzs: 3_000_000n } }) // income
      .mockResolvedValueOnce({ _sum: { amountUzs: 1_200_000n } }); // expense
    const result = await runAggregation(
      userId,
      { metric: "net", period: "last_month" },
      "uz"
    );
    expect(result.data.income).toBe("3000000");
    expect(result.data.expense).toBe("1200000");
    expect(result.data.net).toBe("1800000");
    expect(result.text).toContain("Kirim");
    expect(result.text).toContain("Chiqim");
  });
});

describe("runAggregation — breakdown", () => {
  it("returns breakdown by category", async () => {
    mockGroupBy.mockResolvedValue([
      { categoryId: "cat-1", _sum: { amountUzs: 500_000n } },
      { categoryId: null, _sum: { amountUzs: 200_000n } },
    ]);
    mockCategoryFindMany.mockResolvedValue([
      { id: "cat-1", name: "logistika" },
    ]);
    const result = await runAggregation(
      userId,
      { metric: "breakdown", type: "expense", period: "this_month" },
      "uz"
    );
    expect(result.data.breakdown).toHaveLength(2);
    const breakdown = result.data.breakdown as {
      categoryId: string | null;
      categoryName: string | null;
      amount: string;
    }[];
    expect(breakdown[0].categoryName).toBe("logistika");
    expect(breakdown[0].amount).toBe("500000");
    expect(result.text).toContain("logistika");
  });
});

describe("runAggregation — report", () => {
  it("returns multi-line report with income/expense/net/top categories", async () => {
    // First two calls are income + expense aggregates
    mockAggregate
      .mockResolvedValueOnce({ _sum: { amountUzs: 5_000_000n }, _count: 3 })
      .mockResolvedValueOnce({ _sum: { amountUzs: 2_000_000n }, _count: 2 });
    // groupBy for top 3 expense categories
    mockGroupBy.mockResolvedValue([
      { categoryId: "cat-1", _sum: { amountUzs: 1_200_000n } },
      { categoryId: "cat-2", _sum: { amountUzs: 500_000n } },
      { categoryId: "cat-3", _sum: { amountUzs: 300_000n } },
    ]);
    mockCategoryFindMany.mockResolvedValue([
      { id: "cat-1", name: "ijara" },
      { id: "cat-2", name: "oylik" },
      { id: "cat-3", name: "kommunal" },
    ]);

    const result = await runAggregation(
      userId,
      { metric: "report", period: "this_month" },
      "uz"
    );

    expect(result.data.income).toBe("5000000");
    expect(result.data.expense).toBe("2000000");
    expect(result.data.net).toBe("3000000");
    const top = result.data.topCategories as { categoryName: string; amount: string }[];
    expect(top[0].categoryName).toBe("ijara");
    expect(result.text).toContain("Hisobot");
    expect(result.text).toContain("Kirim");
    expect(result.text).toContain("Chiqim");
    expect(result.text).toContain("ijara");
  });

  it("report in Russian has correct labels", async () => {
    mockAggregate
      .mockResolvedValueOnce({ _sum: { amountUzs: 2_000_000n }, _count: 1 })
      .mockResolvedValueOnce({ _sum: { amountUzs: 1_000_000n }, _count: 1 });
    mockGroupBy.mockResolvedValue([]);
    mockCategoryFindMany.mockResolvedValue([]);

    const result = await runAggregation(
      userId,
      { metric: "report", period: "this_month" },
      "ru"
    );
    expect(result.text).toContain("Отчёт");
    expect(result.text).toContain("Доход");
    expect(result.text).toContain("Расход");
  });
});

describe("runAggregation — category filter returns no-data when category not found", () => {
  it("returns no-data message when category is unknown", async () => {
    mockCategoryFindFirst.mockResolvedValue(null);
    const result = await runAggregation(
      userId,
      { metric: "sum", period: "this_month", category: "nonexistent" },
      "uz"
    );
    expect(result.text).toContain("ma'lumot yo'q");
    expect(result.data.count).toBe(0);
  });
});

describe("runAggregation — enum validation", () => {
  it("throws on invalid metric", async () => {
    await expect(
      runAggregation(
        userId,
        { metric: "invalid_metric" as "sum", period: "this_month" },
        "uz"
      )
    ).rejects.toThrow("Invalid metric");
  });

  it("throws on invalid period", async () => {
    await expect(
      runAggregation(
        userId,
        { metric: "sum", period: "last_year" as "this_year" },
        "uz"
      )
    ).rejects.toThrow("Invalid period");
  });
});

describe("runAggregation — month edge cases (this_month vs last_month)", () => {
  it("last_month is handled without crashes", async () => {
    mockAggregate
      .mockResolvedValueOnce({ _sum: { amountUzs: 0n }, _count: 0 })
      .mockResolvedValueOnce({ _sum: { amountUzs: 0n }, _count: 0 });
    const result = await runAggregation(
      userId,
      { metric: "net", period: "last_month" },
      "en"
    );
    expect(result.data.net).toBe("0");
  });

  it("this_year returns net for full year", async () => {
    mockAggregate
      .mockResolvedValueOnce({ _sum: { amountUzs: 10_000_000n }, _count: 5 })
      .mockResolvedValueOnce({ _sum: { amountUzs: 7_000_000n }, _count: 4 });
    const result = await runAggregation(
      userId,
      { metric: "net", period: "this_year" },
      "en"
    );
    expect(result.data.income).toBe("10000000");
    expect(result.data.expense).toBe("7000000");
    expect(result.data.net).toBe("3000000");
  });
});
