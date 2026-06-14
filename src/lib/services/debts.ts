import { DebtDirection, DebtStatus } from "@prisma/client";
import { db } from "../db";

export interface CreateDebtInput {
  userId: string;
  counterparty: string;
  amountUzs: bigint;
  direction: DebtDirection;
  note?: string | null;
  occurredAt?: Date;
}

export interface UpdateDebtInput {
  counterparty?: string;
  amountUzs?: bigint;
  note?: string | null;
  occurredAt?: Date;
}

export interface DebtTotals {
  givenOpen: bigint;
  takenOpen: bigint;
}

export async function createDebt(input: CreateDebtInput) {
  const prisma = db as import("@prisma/client").PrismaClient;
  return prisma.debt.create({
    data: {
      userId: input.userId,
      counterparty: input.counterparty,
      amountUzs: input.amountUzs,
      direction: input.direction,
      note: input.note ?? null,
      occurredAt: input.occurredAt ?? new Date(),
    },
  });
}

export async function listDebts(
  userId: string,
  filters: { direction?: DebtDirection; status?: DebtStatus } = {}
) {
  const prisma = db as import("@prisma/client").PrismaClient;
  return prisma.debt.findMany({
    where: {
      userId,
      direction: filters.direction,
      status: filters.status,
    },
    orderBy: { occurredAt: "desc" },
  });
}

export async function settleDebt(id: string, userId: string) {
  const prisma = db as import("@prisma/client").PrismaClient;
  const existing = await prisma.debt.findFirst({ where: { id, userId } });
  if (!existing) return null;
  return prisma.debt.update({
    where: { id },
    data: { status: DebtStatus.settled, settledAt: new Date() },
  });
}

export async function updateDebt(
  id: string,
  userId: string,
  input: UpdateDebtInput
) {
  const prisma = db as import("@prisma/client").PrismaClient;
  const existing = await prisma.debt.findFirst({ where: { id, userId } });
  if (!existing) return null;
  return prisma.debt.update({
    where: { id },
    data: {
      counterparty: input.counterparty,
      amountUzs: input.amountUzs,
      note: input.note,
      occurredAt: input.occurredAt,
    },
  });
}

export async function deleteDebt(id: string, userId: string) {
  const prisma = db as import("@prisma/client").PrismaClient;
  const existing = await prisma.debt.findFirst({ where: { id, userId } });
  if (!existing) return null;
  await prisma.debt.delete({ where: { id } });
  return true;
}

export async function getDebtTotals(userId: string): Promise<DebtTotals> {
  const prisma = db as import("@prisma/client").PrismaClient;

  // One groupBy query — no N+1
  const groups = await prisma.debt.groupBy({
    by: ["direction"],
    where: { userId, status: DebtStatus.open },
    _sum: { amountUzs: true },
  });

  let givenOpen = 0n;
  let takenOpen = 0n;

  for (const g of groups) {
    const sum = (g._sum.amountUzs ?? 0n) as bigint;
    if (g.direction === DebtDirection.given) givenOpen = sum;
    else takenOpen = sum;
  }

  return { givenOpen, takenOpen };
}
