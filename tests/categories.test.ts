/**
 * Unit tests for getSmartCategories.
 * All DB calls are mocked — no live database needed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TxType } from "@prisma/client";

// ── Mock DB ───────────────────────────────────────────────────────────────────

const mockCategoryFindMany = vi.fn();
const mockTransactionGroupBy = vi.fn();

vi.mock("@/lib/db", () => ({
  db: new Proxy({} as import("@prisma/client").PrismaClient, {
    get(_target, prop) {
      if (prop === "category") {
        return { findMany: mockCategoryFindMany };
      }
      if (prop === "transaction") {
        return { groupBy: mockTransactionGroupBy };
      }
      return undefined;
    },
  }),
}));

import { getSmartCategories } from "@/lib/services/categories";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getSmartCategories", () => {
  it("returns categories sorted by usage count (most used first)", async () => {
    const cats = [
      { id: "c1", name: "oziq-ovqat" },
      { id: "c2", name: "transport" },
      { id: "c3", name: "kiyim" },
    ];
    // Usage: c2=5, c1=2, c3=0
    const groups = [
      { categoryId: "c2", _count: { _all: 5 } },
      { categoryId: "c1", _count: { _all: 2 } },
    ];
    mockCategoryFindMany.mockResolvedValue(cats);
    mockTransactionGroupBy.mockResolvedValue(groups);

    const result = await getSmartCategories("u1", TxType.expense, null, 3);
    expect(result.map((r) => r.id)).toEqual(["c2", "c1", "c3"]);
  });

  it("boosts score by +1000 when hint substring-matches category name", async () => {
    const cats = [
      { id: "c1", name: "oziq-ovqat" },
      { id: "c2", name: "transport" },
      { id: "c3", name: "kiyim" },
    ];
    // Usage: c2=5, c1=2, c3=0
    const groups = [
      { categoryId: "c2", _count: { _all: 5 } },
      { categoryId: "c1", _count: { _all: 2 } },
    ];
    mockCategoryFindMany.mockResolvedValue(cats);
    mockTransactionGroupBy.mockResolvedValue(groups);

    // hint contains "oziq-ovqat" → c1 gets +1000 boost → c1(1002) > c2(5) > c3(0)
    const result = await getSmartCategories("u1", TxType.expense, "men oziq-ovqat oldim", 3);
    expect(result[0].id).toBe("c1");
  });

  it("respects the limit", async () => {
    const cats = [
      { id: "a", name: "alpha" },
      { id: "b", name: "beta" },
      { id: "c", name: "gamma" },
    ];
    mockCategoryFindMany.mockResolvedValue(cats);
    mockTransactionGroupBy.mockResolvedValue([]);

    const result = await getSmartCategories("u1", TxType.expense, null, 2);
    expect(result.length).toBe(2);
  });

  it("returns empty array when no categories exist", async () => {
    mockCategoryFindMany.mockResolvedValue([]);
    mockTransactionGroupBy.mockResolvedValue([]);

    const result = await getSmartCategories("u1", TxType.income, null, 5);
    expect(result).toEqual([]);
  });
});
