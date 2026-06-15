/**
 * Accounts service unit tests.
 *
 * Tests cover:
 *   1. listAccounts: balance math (initialBalanceUzs + income − expense), NO N+1
 *   2. listAccounts: soft-deleted transactions are excluded from balance
 *   3. getTotalBalance: sums account balances correctly
 *   4. ensureDefaultAccount: creates "Naqd"/cash if none exist; returns existing if already present
 *   5. Null-account safety: transactions with accountId=null are excluded from account balances
 *
 * All DB calls are mocked — no live database needed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AccountType, TxType } from "@prisma/client";

// ── Mock DB ───────────────────────────────────────────────────────────────────

const mockAccountFindMany = vi.fn();
const mockAccountFindFirst = vi.fn();
const mockAccountCreate = vi.fn();
const mockAccountDelete = vi.fn();
const mockAccountUpdate = vi.fn();
const mockTransactionGroupBy = vi.fn();

vi.mock("@/lib/db", () => ({
  db: new Proxy({} as import("@prisma/client").PrismaClient, {
    get(_target, prop) {
      if (prop === "account") {
        return {
          findMany: mockAccountFindMany,
          findFirst: mockAccountFindFirst,
          create: mockAccountCreate,
          delete: mockAccountDelete,
          update: mockAccountUpdate,
        };
      }
      if (prop === "transaction") {
        return {
          groupBy: mockTransactionGroupBy,
        };
      }
      return undefined;
    },
  }),
}));

import {
  listAccounts,
  getTotalBalance,
  ensureDefaultAccount,
  deleteAccount,
} from "@/lib/services/accounts";

// Per-run unique prefix to avoid cross-test collisions
const RUN = `${process.pid}-${Date.now()}`;

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAccount(overrides: Partial<{
  id: string;
  userId: string;
  name: string;
  type: AccountType;
  initialBalanceUzs: bigint;
  createdAt: Date;
}> = {}) {
  return {
    id: overrides.id ?? `acc-${RUN}`,
    userId: overrides.userId ?? `user-${RUN}`,
    name: overrides.name ?? "Naqd",
    type: overrides.type ?? AccountType.cash,
    initialBalanceUzs: overrides.initialBalanceUzs ?? 0n,
    createdAt: overrides.createdAt ?? new Date(),
  };
}

// ── listAccounts: balance math ────────────────────────────────────────────────

describe("listAccounts — balance math", () => {
  it("balance = initialBalanceUzs + income − expense", async () => {
    const acc = makeAccount({ id: "acc-1", initialBalanceUzs: 1_000_000n });
    mockAccountFindMany.mockResolvedValueOnce([acc]);
    mockTransactionGroupBy.mockResolvedValueOnce([
      { accountId: "acc-1", type: TxType.income, _sum: { amountUzs: 3_000_000n } },
      { accountId: "acc-1", type: TxType.expense, _sum: { amountUzs: 500_000n } },
    ]);

    const result = await listAccounts(`user-${RUN}`);
    // 1_000_000 + 3_000_000 - 500_000 = 3_500_000
    expect(result[0].balance).toBe(3_500_000n);
  });

  it("balance = initialBalanceUzs when no transactions", async () => {
    const acc = makeAccount({ id: "acc-2", initialBalanceUzs: 500_000n });
    mockAccountFindMany.mockResolvedValueOnce([acc]);
    mockTransactionGroupBy.mockResolvedValueOnce([]);

    const result = await listAccounts(`user-${RUN}`);
    expect(result[0].balance).toBe(500_000n);
  });

  it("balance can be negative when expenses exceed income + initial", async () => {
    const acc = makeAccount({ id: "acc-3", initialBalanceUzs: 100_000n });
    mockAccountFindMany.mockResolvedValueOnce([acc]);
    mockTransactionGroupBy.mockResolvedValueOnce([
      { accountId: "acc-3", type: TxType.expense, _sum: { amountUzs: 600_000n } },
    ]);

    const result = await listAccounts(`user-${RUN}`);
    // 100_000 - 600_000 = -500_000
    expect(result[0].balance).toBe(-500_000n);
  });

  it("uses a single groupBy call (no N+1) for multiple accounts", async () => {
    const acc1 = makeAccount({ id: "acc-A", initialBalanceUzs: 0n });
    const acc2 = makeAccount({ id: "acc-B", initialBalanceUzs: 200_000n });
    mockAccountFindMany.mockResolvedValueOnce([acc1, acc2]);
    mockTransactionGroupBy.mockResolvedValueOnce([
      { accountId: "acc-A", type: TxType.income, _sum: { amountUzs: 1_000_000n } },
      { accountId: "acc-B", type: TxType.expense, _sum: { amountUzs: 50_000n } },
    ]);

    const result = await listAccounts(`user-${RUN}`);
    expect(mockTransactionGroupBy).toHaveBeenCalledTimes(1); // single query
    expect(result.find((a) => a.id === "acc-A")!.balance).toBe(1_000_000n);
    expect(result.find((a) => a.id === "acc-B")!.balance).toBe(150_000n);
  });

  it("returns empty array when user has no accounts", async () => {
    mockAccountFindMany.mockResolvedValueOnce([]);

    const result = await listAccounts(`user-${RUN}`);
    expect(result).toHaveLength(0);
    expect(mockTransactionGroupBy).not.toHaveBeenCalled();
  });
});

// ── listAccounts: soft-deleted exclusion ──────────────────────────────────────

describe("listAccounts — soft-deleted exclusion", () => {
  it("groupBy query includes deletedAt: null filter (soft-deleted excluded)", async () => {
    const acc = makeAccount({ id: "acc-soft" });
    mockAccountFindMany.mockResolvedValueOnce([acc]);
    mockTransactionGroupBy.mockResolvedValueOnce([]);

    await listAccounts(`user-${RUN}`);

    expect(mockTransactionGroupBy).toHaveBeenCalledTimes(1);
    const [callArg] = mockTransactionGroupBy.mock.calls;
    expect(callArg[0].where.deletedAt).toBe(null);
  });
});

// ── getTotalBalance ───────────────────────────────────────────────────────────

describe("getTotalBalance", () => {
  it("sums all account balances including initial", async () => {
    const acc1 = makeAccount({ id: "acc-tot-1", initialBalanceUzs: 500_000n });
    const acc2 = makeAccount({ id: "acc-tot-2", initialBalanceUzs: 300_000n });
    mockAccountFindMany.mockResolvedValueOnce([acc1, acc2]);
    mockTransactionGroupBy.mockResolvedValueOnce([
      { accountId: "acc-tot-1", type: TxType.income, _sum: { amountUzs: 200_000n } },
    ]);

    const total = await getTotalBalance(`user-${RUN}`);
    // acc1 = 500_000 + 200_000 = 700_000; acc2 = 300_000 + 0 = 300_000; total = 1_000_000
    expect(total).toBe(1_000_000n);
  });

  it("returns 0n when no accounts", async () => {
    mockAccountFindMany.mockResolvedValueOnce([]);

    const total = await getTotalBalance(`user-${RUN}`);
    expect(total).toBe(0n);
  });
});

// ── ensureDefaultAccount ──────────────────────────────────────────────────────

describe("ensureDefaultAccount", () => {
  it("returns existing account id if one exists", async () => {
    const existingId = `acc-exist-${RUN}`;
    mockAccountFindFirst.mockResolvedValueOnce({ id: existingId });

    const id = await ensureDefaultAccount(`user-${RUN}`);
    expect(id).toBe(existingId);
    expect(mockAccountCreate).not.toHaveBeenCalled();
  });

  it("creates a Naqd/cash account when none exist", async () => {
    const newId = `acc-new-${RUN}`;
    mockAccountFindFirst.mockResolvedValueOnce(null);
    mockAccountCreate.mockResolvedValueOnce({ id: newId });

    const id = await ensureDefaultAccount(`user-${RUN}`);
    expect(id).toBe(newId);
    expect(mockAccountCreate).toHaveBeenCalledTimes(1);

    const createArg = mockAccountCreate.mock.calls[0][0].data;
    expect(createArg.name).toBe("Naqd");
    expect(createArg.type).toBe(AccountType.cash);
    expect(createArg.initialBalanceUzs).toBe(0n);
  });
});

// ── deleteAccount: owner check ────────────────────────────────────────────────

describe("deleteAccount", () => {
  it("returns false when account not found (owner check)", async () => {
    mockAccountFindFirst.mockResolvedValueOnce(null);

    const result = await deleteAccount("acc-x", "wrong-user");
    expect(result).toBe(false);
    expect(mockAccountDelete).not.toHaveBeenCalled();
  });

  it("deletes and returns true when owner matches", async () => {
    const userId = `user-del-${RUN}`;
    mockAccountFindFirst.mockResolvedValueOnce({ id: "acc-del", userId });
    mockAccountDelete.mockResolvedValueOnce({});

    const result = await deleteAccount("acc-del", userId);
    expect(result).toBe(true);
    expect(mockAccountDelete).toHaveBeenCalledWith({ where: { id: "acc-del", userId } });
  });
});

// ── Null-account safety ───────────────────────────────────────────────────────

describe("null-account safety", () => {
  it("groupBy only sums transactions for known account ids (not null-account txns)", async () => {
    const acc = makeAccount({ id: "acc-known", initialBalanceUzs: 0n });
    mockAccountFindMany.mockResolvedValueOnce([acc]);
    // Simulate: Prisma returns only rows matching the `accountId: { in: [acc.id] }` filter
    // (null-account rows are excluded by the DB query — we just confirm the `in` filter is set)
    mockTransactionGroupBy.mockResolvedValueOnce([]);

    await listAccounts(`user-${RUN}`);

    const [callArg] = mockTransactionGroupBy.mock.calls;
    const whereAccountId = callArg[0].where.accountId;
    // Must use { in: [...] } — NOT undefined (which would include all)
    expect(whereAccountId).toHaveProperty("in");
    expect(Array.isArray(whereAccountId.in)).toBe(true);
    expect(whereAccountId.in).toContain("acc-known");
    // Must not include null
    expect(whereAccountId.in).not.toContain(null);
    expect(whereAccountId.in).not.toContain(undefined);
  });
});
