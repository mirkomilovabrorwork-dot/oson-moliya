/**
 * Unit tests for getSmartCategories and resolveOrCreateCategory.
 * All DB calls are mocked — no live database needed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TxType } from "@prisma/client";

// ── Mock DB ───────────────────────────────────────────────────────────────────

const mockCategoryFindMany = vi.fn();
const mockTransactionGroupBy = vi.fn();
const mockCategoryFindUnique = vi.fn();
const mockCategoryCreate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: new Proxy({} as import("@prisma/client").PrismaClient, {
    get(_target, prop) {
      if (prop === "category") {
        return {
          findMany: mockCategoryFindMany,
          findUnique: mockCategoryFindUnique,
          create: mockCategoryCreate,
        };
      }
      if (prop === "transaction") {
        return { groupBy: mockTransactionGroupBy };
      }
      return undefined;
    },
  }),
}));

import { getSmartCategories, resolveOrCreateCategory } from "@/lib/services/categories";

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

// ── resolveOrCreateCategory — A2 guard ───────────────────────────────────────

describe("resolveOrCreateCategory — cross-type guard (A2)", () => {
  it("routes an expense-canonical name used as income to 'boshqa kirim'", async () => {
    // 'kommunal' is a canonical EXPENSE word. When called with TxType.income,
    // the guard should route it to 'boshqa kirim' (income generic bucket).
    const bucketId = "bucket-boshqa-kirim";

    // First findUnique: for 'boshqa kirim' bucket — already exists
    mockCategoryFindUnique.mockResolvedValueOnce({ id: bucketId, name: "boshqa kirim" });

    const result = await resolveOrCreateCategory("u1", "kommunal", TxType.income);

    // Should return the boshqa kirim bucket id, not create a new 'kommunal' row
    expect(result).toBe(bucketId);
    expect(mockCategoryCreate).not.toHaveBeenCalled();

    // The findUnique call must have used 'boshqa kirim', not 'kommunal'
    expect(mockCategoryFindUnique).toHaveBeenCalledWith({
      where: {
        userId_name_type: { userId: "u1", name: "boshqa kirim", type: TxType.income },
      },
    });
  });

  it("creates the 'boshqa kirim' bucket if it does not exist yet, then returns its id", async () => {
    const newBucketId = "new-bucket-id";

    // findUnique returns null (bucket not seeded yet)
    mockCategoryFindUnique.mockResolvedValueOnce(null);
    // create returns the new bucket
    mockCategoryCreate.mockResolvedValueOnce({ id: newBucketId });

    const result = await resolveOrCreateCategory("u1", "oziq-ovqat", TxType.income);

    expect(result).toBe(newBucketId);
    // Must have tried to create 'boshqa kirim' with income type
    expect(mockCategoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "boshqa kirim", type: TxType.income }),
      })
    );
  });

  it("routes an income-canonical name used as expense to 'boshqa chiqim'", async () => {
    // 'sotuv' is a canonical INCOME word. When called with TxType.expense,
    // the guard should route it to 'boshqa chiqim'.
    const bucketId = "bucket-boshqa-chiqim";

    mockCategoryFindUnique.mockResolvedValueOnce({ id: bucketId, name: "boshqa chiqim" });

    const result = await resolveOrCreateCategory("u1", "sotuv", TxType.expense);

    expect(result).toBe(bucketId);
    expect(mockCategoryCreate).not.toHaveBeenCalled();
    expect(mockCategoryFindUnique).toHaveBeenCalledWith({
      where: {
        userId_name_type: { userId: "u1", name: "boshqa chiqim", type: TxType.expense },
      },
    });
  });

  it("does NOT reroute a correctly-typed canonical name", async () => {
    // 'transport' is a canonical EXPENSE — when called as expense, use directly.
    const catId = "transport-cat-id";
    mockCategoryFindUnique.mockResolvedValueOnce({ id: catId, name: "transport" });

    const result = await resolveOrCreateCategory("u1", "transport", TxType.expense);

    expect(result).toBe(catId);
    // The lookup should have been for 'transport', not 'boshqa chiqim'
    expect(mockCategoryFindUnique).toHaveBeenCalledWith({
      where: {
        userId_name_type: { userId: "u1", name: "transport", type: TxType.expense },
      },
    });
  });

  it("does NOT reroute a completely custom (non-canonical) name", async () => {
    // 'custom-cat' is not in the canonical list — create as-is
    const newId = "custom-new-id";
    mockCategoryFindUnique.mockResolvedValueOnce(null);
    mockCategoryCreate.mockResolvedValueOnce({ id: newId });

    const result = await resolveOrCreateCategory("u1", "Custom-Cat", TxType.expense);

    expect(result).toBe(newId);
    expect(mockCategoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "custom-cat", type: TxType.expense }),
      })
    );
  });
});
