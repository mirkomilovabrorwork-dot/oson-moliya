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

const mockDebtFindMany = vi.fn();
const mockDebtFindFirst = vi.fn();
const mockDebtUpdate = vi.fn();
const mockDebtDelete = vi.fn();
const mockDebtCreate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: new Proxy({} as import("@prisma/client").PrismaClient, {
    get(_target, prop) {
      if (prop === "debt") {
        return {
          groupBy: vi.fn().mockResolvedValue([]),
          findFirst: mockDebtFindFirst,
          update: mockDebtUpdate,
          delete: mockDebtDelete,
          create: mockDebtCreate,
          findMany: mockDebtFindMany,
        };
      }
      return undefined;
    },
  }),
}));

import { getDebtTotals, settleDebt, deleteDebt, createDebt, updateDebt } from "@/lib/services/debts";
import { DebtDirection, DebtStatus } from "@prisma/client";

// Per-run unique prefix to avoid cross-test collisions
const RUN = `${process.pid}-${Date.now()}`;

beforeEach(() => {
  vi.clearAllMocks();
});

// ── getDebtTotals ─────────────────────────────────────────────────────────────

describe("getDebtTotals", () => {
  it("sums given and taken open debts separately", async () => {
    mockDebtFindMany.mockResolvedValueOnce([
      { direction: DebtDirection.given, amountUzs: 2_000_000n, payments: [] },
      { direction: DebtDirection.given, amountUzs: 1_000_000n, payments: [] },
      { direction: DebtDirection.taken, amountUzs: 1_500_000n, payments: [] },
    ]);

    const totals = await getDebtTotals(`user-${RUN}-1`);
    expect(totals.givenOpen).toBe(3_000_000n);
    expect(totals.takenOpen).toBe(1_500_000n);
  });

  it("returns 0n for each direction when no open debts exist", async () => {
    mockDebtFindMany.mockResolvedValueOnce([]);

    const totals = await getDebtTotals(`user-${RUN}-2`);
    expect(totals.givenOpen).toBe(0n);
    expect(totals.takenOpen).toBe(0n);
  });

  it("handles only given-direction debts (takenOpen stays 0n)", async () => {
    mockDebtFindMany.mockResolvedValueOnce([
      { direction: DebtDirection.given, amountUzs: 500_000n, payments: [] },
    ]);

    const totals = await getDebtTotals(`user-${RUN}-3`);
    expect(totals.givenOpen).toBe(500_000n);
    expect(totals.takenOpen).toBe(0n);
  });

  it("handles only taken-direction debts (givenOpen stays 0n)", async () => {
    mockDebtFindMany.mockResolvedValueOnce([
      { direction: DebtDirection.taken, amountUzs: 800_000n, payments: [] },
    ]);

    const totals = await getDebtTotals(`user-${RUN}-4`);
    expect(totals.givenOpen).toBe(0n);
    expect(totals.takenOpen).toBe(800_000n);
  });

  it("subtracts partial payments from open debt totals", async () => {
    mockDebtFindMany.mockResolvedValueOnce([
      {
        direction: DebtDirection.given,
        amountUzs: 500_000n,
        payments: [{ amountUzs: 200_000n }],
      },
    ]);

    const totals = await getDebtTotals(`user-${RUN}-5`);
    expect(totals.givenOpen).toBe(300_000n);
    expect(totals.takenOpen).toBe(0n);
  });

  it("passes status:open and deletedAt:null filter to findMany (only one query)", async () => {
    mockDebtFindMany.mockResolvedValueOnce([]);

    await getDebtTotals(`user-${RUN}-6`);
    expect(mockDebtFindMany).toHaveBeenCalledTimes(1);
    const [callArgs] = mockDebtFindMany.mock.calls;
    expect(callArgs[0].where.status).toBe(DebtStatus.open);
    expect(callArgs[0].where.deletedAt).toBeNull();
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
      where: { id: debtId, userId, deletedAt: null },
    });
  });
});

// ── deleteDebt ────────────────────────────────────────────────────────────────

describe("deleteDebt", () => {
  const userId = `user-${RUN}-delete`;
  const debtId = `debt-${RUN}-2`;

  it("soft-deletes the debt (sets deletedAt) and returns true", async () => {
    mockDebtFindFirst.mockResolvedValueOnce({ id: debtId, userId });
    mockDebtUpdate.mockResolvedValueOnce({});

    const result = await deleteDebt(debtId, userId);
    expect(result).toBe(true);
    expect(mockDebtUpdate).toHaveBeenCalledWith({
      where: { id: debtId },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it("returns null when debt not found (owner check)", async () => {
    mockDebtFindFirst.mockResolvedValueOnce(null);

    const result = await deleteDebt(debtId, "wrong-user");
    expect(result).toBeNull();
    expect(mockDebtUpdate).not.toHaveBeenCalled();
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

// ── updateDebt ────────────────────────────────────────────────────────────────

describe("updateDebt", () => {
  const userId = `user-${RUN}-update`;
  const debtId = `debt-${RUN}-update`;

  const baseDebt = {
    id: debtId,
    userId,
    counterparty: "OldName",
    amountUzs: 100_000n,
    direction: DebtDirection.given,
    status: DebtStatus.open,
    note: null,
    occurredAt: new Date(),
    settledAt: null,
    createdAt: new Date(),
    deletedAt: null,
  };

  it("persists a new counterparty literally (no brain parsing)", async () => {
    const updated = { ...baseDebt, counterparty: "Sarvar" };
    mockDebtFindFirst.mockResolvedValueOnce(baseDebt);
    mockDebtUpdate.mockResolvedValueOnce(updated);

    const result = await updateDebt(debtId, userId, { counterparty: "Sarvar" });
    expect(result).not.toBeNull();
    expect(result!.counterparty).toBe("Sarvar");
    const updateArg = mockDebtUpdate.mock.calls[0][0].data;
    expect(updateArg.counterparty).toBe("Sarvar");
  });

  it("persists a new direction", async () => {
    const updated = { ...baseDebt, direction: DebtDirection.taken };
    mockDebtFindFirst.mockResolvedValueOnce(baseDebt);
    mockDebtUpdate.mockResolvedValueOnce(updated);

    const result = await updateDebt(debtId, userId, { direction: DebtDirection.taken });
    expect(result).not.toBeNull();
    expect(result!.direction).toBe(DebtDirection.taken);
    const updateArg = mockDebtUpdate.mock.calls[0][0].data;
    expect(updateArg.direction).toBe(DebtDirection.taken);
  });

  it("returns null when debt not found (owner check)", async () => {
    mockDebtFindFirst.mockResolvedValueOnce(null);

    const result = await updateDebt(debtId, "wrong-user", { counterparty: "X" });
    expect(result).toBeNull();
    expect(mockDebtUpdate).not.toHaveBeenCalled();
  });
});
