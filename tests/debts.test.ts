/**
 * Debts service unit tests.
 *
 * Tests focus on pure logic:
 *   1. getDebtTotals: correct aggregation of givenOpen / takenOpen
 *   2. settleDebt: owner-check, sets status + settledAt
 *   3. deleteDebt: owner-check
 *
 * All DB calls are mocked — no live database needed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock DB ───────────────────────────────────────────────────────────────────

const mockDebtGroupBy = vi.fn();
const mockDebtFindFirst = vi.fn();
const mockDebtUpdate = vi.fn();
const mockDebtDelete = vi.fn();
const mockDebtCreate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: new Proxy({} as import("@prisma/client").PrismaClient, {
    get(_target, prop) {
      if (prop === "debt") {
        return {
          groupBy: mockDebtGroupBy,
          findFirst: mockDebtFindFirst,
          update: mockDebtUpdate,
          delete: mockDebtDelete,
          create: mockDebtCreate,
          findMany: vi.fn().mockResolvedValue([]),
        };
      }
      return undefined;
    },
  }),
}));

import { getDebtTotals, settleDebt, deleteDebt, createDebt } from "@/lib/services/debts";
import { DebtDirection, DebtStatus } from "@prisma/client";

// Per-run unique prefix to avoid cross-test collisions
const RUN = `${process.pid}-${Date.now()}`;

beforeEach(() => {
  vi.clearAllMocks();
});

// ── getDebtTotals ─────────────────────────────────────────────────────────────

describe("getDebtTotals", () => {
  it("sums given and taken open debts separately", async () => {
    mockDebtGroupBy.mockResolvedValueOnce([
      { direction: DebtDirection.given, _sum: { amountUzs: 3_000_000n } },
      { direction: DebtDirection.taken, _sum: { amountUzs: 1_500_000n } },
    ]);

    const totals = await getDebtTotals(`user-${RUN}-1`);
    expect(totals.givenOpen).toBe(3_000_000n);
    expect(totals.takenOpen).toBe(1_500_000n);
  });

  it("returns 0n for each direction when no open debts exist", async () => {
    mockDebtGroupBy.mockResolvedValueOnce([]);

    const totals = await getDebtTotals(`user-${RUN}-2`);
    expect(totals.givenOpen).toBe(0n);
    expect(totals.takenOpen).toBe(0n);
  });

  it("handles only given-direction debts (takenOpen stays 0n)", async () => {
    mockDebtGroupBy.mockResolvedValueOnce([
      { direction: DebtDirection.given, _sum: { amountUzs: 500_000n } },
    ]);

    const totals = await getDebtTotals(`user-${RUN}-3`);
    expect(totals.givenOpen).toBe(500_000n);
    expect(totals.takenOpen).toBe(0n);
  });

  it("handles only taken-direction debts (givenOpen stays 0n)", async () => {
    mockDebtGroupBy.mockResolvedValueOnce([
      { direction: DebtDirection.taken, _sum: { amountUzs: 800_000n } },
    ]);

    const totals = await getDebtTotals(`user-${RUN}-4`);
    expect(totals.givenOpen).toBe(0n);
    expect(totals.takenOpen).toBe(800_000n);
  });

  it("treats null _sum.amountUzs as 0n (no N+1, uses groupBy result)", async () => {
    mockDebtGroupBy.mockResolvedValueOnce([
      { direction: DebtDirection.given, _sum: { amountUzs: null } },
    ]);

    const totals = await getDebtTotals(`user-${RUN}-5`);
    expect(totals.givenOpen).toBe(0n);
    expect(totals.takenOpen).toBe(0n);
  });

  it("passes status:open filter to groupBy (only one groupBy call, no extra queries)", async () => {
    mockDebtGroupBy.mockResolvedValueOnce([]);

    await getDebtTotals(`user-${RUN}-6`);
    expect(mockDebtGroupBy).toHaveBeenCalledTimes(1);
    const [callArgs] = mockDebtGroupBy.mock.calls;
    expect(callArgs[0].where.status).toBe(DebtStatus.open);
  });
});

// ── settleDebt ────────────────────────────────────────────────────────────────

describe("settleDebt", () => {
  const userId = `user-${RUN}-settle`;
  const debtId = `debt-${RUN}-1`;

  const mockDebt = {
    id: debtId,
    userId,
    counterparty: "Ali",
    amountUzs: 200_000n,
    direction: DebtDirection.given,
    status: DebtStatus.open,
    note: null,
    occurredAt: new Date(),
    settledAt: null,
    createdAt: new Date(),
  };

  it("settles an open debt and returns the updated record", async () => {
    const settledRecord = {
      ...mockDebt,
      status: DebtStatus.settled,
      settledAt: new Date(),
    };
    mockDebtFindFirst.mockResolvedValueOnce(mockDebt);
    mockDebtUpdate.mockResolvedValueOnce(settledRecord);

    const result = await settleDebt(debtId, userId);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(DebtStatus.settled);
    expect(result!.settledAt).toBeInstanceOf(Date);
  });

  it("returns null when debt not found (owner check fails)", async () => {
    mockDebtFindFirst.mockResolvedValueOnce(null);

    const result = await settleDebt(debtId, "wrong-user");
    expect(result).toBeNull();
    expect(mockDebtUpdate).not.toHaveBeenCalled();
  });

  it("passes userId to findFirst for owner-scoping", async () => {
    mockDebtFindFirst.mockResolvedValueOnce(null);

    await settleDebt(debtId, userId);
    expect(mockDebtFindFirst).toHaveBeenCalledWith({
      where: { id: debtId, userId },
    });
  });
});

// ── deleteDebt ────────────────────────────────────────────────────────────────

describe("deleteDebt", () => {
  const userId = `user-${RUN}-delete`;
  const debtId = `debt-${RUN}-2`;

  it("deletes the debt and returns true", async () => {
    mockDebtFindFirst.mockResolvedValueOnce({ id: debtId, userId });
    mockDebtDelete.mockResolvedValueOnce({});

    const result = await deleteDebt(debtId, userId);
    expect(result).toBe(true);
    expect(mockDebtDelete).toHaveBeenCalledWith({ where: { id: debtId } });
  });

  it("returns null when debt not found (owner check)", async () => {
    mockDebtFindFirst.mockResolvedValueOnce(null);

    const result = await deleteDebt(debtId, "wrong-user");
    expect(result).toBeNull();
    expect(mockDebtDelete).not.toHaveBeenCalled();
  });
});

// ── createDebt ────────────────────────────────────────────────────────────────

describe("createDebt", () => {
  it("calls prisma.debt.create with correct shape", async () => {
    const userId = `user-${RUN}-create`;
    const input = {
      userId,
      counterparty: "Baraka LLC",
      amountUzs: 1_000_000n,
      direction: DebtDirection.given,
      note: "oy oxirigacha",
      occurredAt: new Date("2026-06-01"),
    };
    const expected = { id: "new-id", ...input, status: DebtStatus.open, createdAt: new Date(), settledAt: null };
    mockDebtCreate.mockResolvedValueOnce(expected);

    const result = await createDebt(input);
    expect(result.id).toBe("new-id");
    expect(mockDebtCreate).toHaveBeenCalledTimes(1);
    const createArg = mockDebtCreate.mock.calls[0][0].data;
    expect(createArg.userId).toBe(userId);
    expect(createArg.counterparty).toBe("Baraka LLC");
    expect(createArg.amountUzs).toBe(1_000_000n);
    expect(createArg.direction).toBe(DebtDirection.given);
  });

  it("defaults occurredAt to now when not provided", async () => {
    const before = Date.now();
    mockDebtCreate.mockResolvedValueOnce({ id: "x" });

    await createDebt({
      userId: `user-${RUN}-7`,
      counterparty: "Test",
      amountUzs: 100n,
      direction: DebtDirection.taken,
    });

    const after = Date.now();
    const createArg = mockDebtCreate.mock.calls[0][0].data;
    const occurred = (createArg.occurredAt as Date).getTime();
    expect(occurred).toBeGreaterThanOrEqual(before - 5);
    expect(occurred).toBeLessThanOrEqual(after + 5);
  });
});
