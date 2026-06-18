/**
 * Extra analytics tests:
 *  - computeDelta (pure, no DB)
 *  - tashkentDayLabel / tashkentMonthLabel (pure bucket-label helpers)
 *  - runAggregation groupBy day/month (mocked DB)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeDelta, tashkentDayLabel, tashkentMonthLabel } from "@/lib/services/analytics";

// ── computeDelta ──────────────────────────────────────────────────────────────

describe("computeDelta", () => {
  it("positive delta: current > previous", () => {
    const result = computeDelta(1_500_000n, 1_000_000n);
    expect(result.abs).toBe(500_000n);
    expect(result.pct).toBe(50);
  });

  it("negative delta: current < previous", () => {
    const result = computeDelta(800_000n, 1_000_000n);
    expect(result.abs).toBe(-200_000n);
    expect(result.pct).toBe(-20);
  });

  it("previous === 0n → pct is null (no divide-by-zero)", () => {
    const result = computeDelta(500_000n, 0n);
    expect(result.abs).toBe(500_000n);
    expect(result.pct).toBeNull();
  });

  it("both zero → abs 0, pct null", () => {
    const result = computeDelta(0n, 0n);
    expect(result.abs).toBe(0n);
    expect(result.pct).toBeNull();
  });

  it("equal values → abs 0, pct 0", () => {
    const result = computeDelta(2_000_000n, 2_000_000n);
    expect(result.abs).toBe(0n);
    expect(result.pct).toBe(0);
  });

  it("large values stay BigInt precise", () => {
    const big = 9_999_999_999_999n;
    const result = computeDelta(big, big);
    expect(result.abs).toBe(0n);
    expect(result.pct).toBe(0);
  });
});

// ── tashkentDayLabel / tashkentMonthLabel ─────────────────────────────────────

describe("tashkentDayLabel", () => {
  it("UTC 19:00 on 2025-05-31 → Tashkent 2025-06-01 00:00 → label 2025-06-01", () => {
    // 2025-05-31T19:00:00Z = June 1 00:00 Tashkent
    const utc = new Date("2025-05-31T19:00:00.000Z");
    expect(tashkentDayLabel(utc)).toBe("2025-06-01");
  });

  it("UTC 18:59 on 2025-05-31 → Tashkent 2025-05-31 23:59 → label 2025-05-31", () => {
    const utc = new Date("2025-05-31T18:59:00.000Z");
    expect(tashkentDayLabel(utc)).toBe("2025-05-31");
  });

  it("UTC midnight 2025-06-15T00:00:00Z → Tashkent 2025-06-15 05:00 → label 2025-06-15", () => {
    const utc = new Date("2025-06-15T00:00:00.000Z");
    expect(tashkentDayLabel(utc)).toBe("2025-06-15");
  });
});

describe("tashkentMonthLabel", () => {
  it("UTC 2025-05-31T19:00:00Z (= June 1 Tashkent) → 2025-06", () => {
    const utc = new Date("2025-05-31T19:00:00.000Z");
    expect(tashkentMonthLabel(utc)).toBe("2025-06");
  });

  it("UTC 2025-05-31T18:59:00Z (= May 31 Tashkent) → 2025-05", () => {
    const utc = new Date("2025-05-31T18:59:00.000Z");
    expect(tashkentMonthLabel(utc)).toBe("2025-05");
  });

  it("UTC 2024-12-31T19:00:00Z (= Jan 1 Tashkent) → 2025-01", () => {
    const utc = new Date("2024-12-31T19:00:00.000Z");
    expect(tashkentMonthLabel(utc)).toBe("2025-01");
  });
});

// ── runAggregation groupBy day/month (mocked DB) ───────────────────────────────

const mockAggregate = vi.fn();
const mockGroupBy = vi.fn();
const mockFindMany = vi.fn();
const mockCategoryFindFirst = vi.fn();
const mockCategoryFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  db: new Proxy({} as import("@prisma/client").PrismaClient, {
    get(_target, prop) {
      if (prop === "transaction") {
        return {
          aggregate: mockAggregate,
          groupBy: mockGroupBy,
          findMany: mockFindMany,
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

const userId = "test-user-extra";

beforeEach(() => {
  vi.clearAllMocks();
  mockCategoryFindFirst.mockResolvedValue(null);
  mockCategoryFindMany.mockResolvedValue([]);
  mockFindMany.mockResolvedValue([]);
});

describe("runAggregation — sum + groupBy:day", () => {
  it("buckets transactions by Tashkent day", async () => {
    // Two transactions on different Tashkent days
    // June 1 Tashkent = May 31 19:00 UTC (income)
    // June 2 Tashkent = June 1 19:00 UTC (expense)
    mockFindMany.mockResolvedValue([
      {
        amountUzs: 1_000_000n,
        type: "income",
        occurredAt: new Date("2025-05-31T20:00:00.000Z"), // June 1 Tashkent 01:00
      },
      {
        amountUzs: 500_000n,
        type: "expense",
        occurredAt: new Date("2025-06-01T19:30:00.000Z"), // June 2 Tashkent 00:30
      },
    ]);

    const result = await runAggregation(
      userId,
      { metric: "sum", period: "this_month", groupBy: "day" },
      "uz"
    );

    expect(result.data.buckets).toBeDefined();
    const buckets = result.data.buckets as {
      label: string;
      income: string;
      expense: string;
      net: string;
    }[];
    expect(buckets).toHaveLength(2);
    expect(buckets[0].label).toBe("2025-06-01");
    expect(buckets[0].income).toBe("1000000");
    expect(buckets[0].expense).toBe("0");
    expect(buckets[0].net).toBe("1000000");
    expect(buckets[1].label).toBe("2025-06-02");
    expect(buckets[1].expense).toBe("500000");
    expect(buckets[1].net).toBe("-500000");
    expect(result.text).toContain("Davr bo'yicha");
    expect(result.text).toContain("2025-06-01");
    expect(result.text).toContain("2025-06-02");
  });

  it("returns empty text when no transactions", async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await runAggregation(
      userId,
      { metric: "sum", period: "today", groupBy: "day" },
      "uz"
    );
    expect(result.text).toContain("ma'lumot yo'q");
    const buckets = result.data.buckets as unknown[];
    expect(buckets).toHaveLength(0);
  });
});

describe("runAggregation — net + groupBy:month", () => {
  it("buckets income and expense by Tashkent month", async () => {
    mockFindMany.mockResolvedValue([
      {
        amountUzs: 3_000_000n,
        type: "income",
        occurredAt: new Date("2025-04-30T19:00:00.000Z"), // May 1 00:00 Tashkent → label 2025-05
      },
      {
        amountUzs: 1_000_000n,
        type: "expense",
        occurredAt: new Date("2025-05-31T19:00:00.000Z"), // June 1 00:00 Tashkent → label 2025-06
      },
    ]);

    const result = await runAggregation(
      userId,
      { metric: "net", period: "this_year", groupBy: "month" },
      "en"
    );

    const buckets = result.data.buckets as {
      label: string;
      income: string;
      expense: string;
      net: string;
    }[];
    expect(buckets).toHaveLength(2);
    const may = buckets.find((b) => b.label === "2025-05");
    expect(may).toBeDefined();
    expect(may!.income).toBe("3000000");
    expect(may!.expense).toBe("0");
    expect(may!.net).toBe("3000000");
    const jun = buckets.find((b) => b.label === "2025-06");
    expect(jun).toBeDefined();
    expect(jun!.expense).toBe("1000000");
    expect(jun!.net).toBe("-1000000");
    expect(result.text).toContain("By period");
  });
});

describe("runAggregation — breakdown + limit", () => {
  it("respects limit on breakdown", async () => {
    mockGroupBy.mockResolvedValue([
      { categoryId: "cat-1", _sum: { amountUzs: 900_000n } },
      { categoryId: "cat-2", _sum: { amountUzs: 600_000n } },
    ]);
    mockCategoryFindMany.mockResolvedValue([
      { id: "cat-1", name: "ijara" },
      { id: "cat-2", name: "oylik" },
    ]);

    const result = await runAggregation(
      userId,
      { metric: "breakdown", period: "this_month", limit: 2 },
      "uz"
    );

    const bd = result.data.breakdown as { categoryName: string }[];
    expect(bd).toHaveLength(2);
    expect(bd[0].categoryName).toBe("ijara");
  });
});
