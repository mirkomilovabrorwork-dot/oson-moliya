import { AccountType, TxType } from "@prisma/client";
import { db } from "../db";

export interface CreateAccountInput {
  userId: string;
  name: string;
  type: AccountType;
  initialBalanceUzs?: bigint;
}

export interface UpdateAccountInput {
  name?: string;
  type?: AccountType;
  initialBalanceUzs?: bigint;
}

export interface AccountWithBalance {
  id: string;
  userId: string;
  name: string;
  type: AccountType;
  initialBalanceUzs: bigint;
  createdAt: Date;
  balance: bigint;
}

export async function createAccount(input: CreateAccountInput): Promise<AccountWithBalance> {
  const prisma = db as import("@prisma/client").PrismaClient;
  const account = await prisma.account.create({
    data: {
      userId: input.userId,
      name: input.name,
      type: input.type,
      initialBalanceUzs: input.initialBalanceUzs ?? 0n,
    },
  });
  // Brand new account: balance = initial (no transactions yet)
  return { ...account, balance: account.initialBalanceUzs };
}

export async function listAccounts(userId: string): Promise<AccountWithBalance[]> {
  const prisma = db as import("@prisma/client").PrismaClient;

  // Fetch all accounts for the user
  const accounts = await prisma.account.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });

  if (accounts.length === 0) return [];

  // Single groupBy query for all accounts — NO N+1
  // Exclude soft-deleted transactions (deletedAt: null)
  const groups = await prisma.transaction.groupBy({
    by: ["accountId", "type"],
    where: {
      userId,
      accountId: { in: accounts.map((a) => a.id) },
      deletedAt: null,
    },
    _sum: { amountUzs: true },
  });

  // Build a map: accountId -> { income: bigint, expense: bigint }
  type Sums = { income: bigint; expense: bigint };
  const sumMap = new Map<string, Sums>();

  for (const g of groups) {
    if (!g.accountId) continue;
    const existing = sumMap.get(g.accountId) ?? { income: 0n, expense: 0n };
    const sum = (g._sum.amountUzs ?? 0n) as bigint;
    if (g.type === TxType.income) {
      existing.income = sum;
    } else {
      existing.expense = sum;
    }
    sumMap.set(g.accountId, existing);
  }

  return accounts.map((a) => {
    const sums = sumMap.get(a.id) ?? { income: 0n, expense: 0n };
    const balance = a.initialBalanceUzs + sums.income - sums.expense;
    return { ...a, balance };
  });
}

export async function updateAccount(
  id: string,
  userId: string,
  input: UpdateAccountInput
): Promise<AccountWithBalance | null> {
  const prisma = db as import("@prisma/client").PrismaClient;
  const existing = await prisma.account.findFirst({ where: { id, userId } });
  if (!existing) return null;

  const updated = await prisma.account.update({
    where: { id },
    data: {
      name: input.name,
      type: input.type,
      initialBalanceUzs: input.initialBalanceUzs,
    },
  });

  // Recompute balance for the updated account
  const txSums = await prisma.transaction.groupBy({
    by: ["type"],
    where: { accountId: id, deletedAt: null },
    _sum: { amountUzs: true },
  });

  let income = 0n;
  let expense = 0n;
  for (const g of txSums) {
    const sum = (g._sum.amountUzs ?? 0n) as bigint;
    if (g.type === TxType.income) income = sum;
    else expense = sum;
  }

  return { ...updated, balance: updated.initialBalanceUzs + income - expense };
}

export async function deleteAccount(id: string, userId: string): Promise<boolean> {
  const prisma = db as import("@prisma/client").PrismaClient;
  const existing = await prisma.account.findFirst({ where: { id, userId } });
  if (!existing) return false;

  // On delete, Prisma's SetNull cascade clears transaction.accountId automatically
  await prisma.account.delete({ where: { id } });
  return true;
}

export async function getTotalBalance(userId: string): Promise<bigint> {
  const accounts = await listAccounts(userId);
  return accounts.reduce((sum, a) => sum + a.balance, 0n);
}

/**
 * Ensure the user has at least one account. If none exist, create a "Naqd"
 * (cash) account. Returns the id of the default account (the first one by
 * createdAt, or the newly created one).
 */
export async function ensureDefaultAccount(userId: string): Promise<string> {
  const prisma = db as import("@prisma/client").PrismaClient;

  const first = await prisma.account.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (first) return first.id;

  const created = await prisma.account.create({
    data: {
      userId,
      name: "Naqd",
      type: AccountType.cash,
      initialBalanceUzs: 0n,
    },
    select: { id: true },
  });

  return created.id;
}
