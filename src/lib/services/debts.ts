import { DebtDirection, DebtStatus } from "@prisma/client";
import { db } from "../db";

export interface AddDebtPaymentInput {
  debtId: string;
  userId: string;
  amountUzs: bigint;
  occurredAt: Date;
  note?: string | null;
}

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
  direction?: DebtDirection;
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
      deletedAt: null,
      direction: filters.direction,
      status: filters.status,
    },
    orderBy: { occurredAt: "desc" },
  });
}

export async function settleDebt(id: string, userId: string) {
  const prisma = db as import("@prisma/client").PrismaClient;
  const existing = await prisma.debt.findFirst({ where: { id, userId, deletedAt: null } });
  if (!existing) return null;
  return prisma.debt.update({
    where: { id, userId },
    data: { status: DebtStatus.settled, settledAt: new Date() },
  });
}

export async function updateDebt(
  id: string,
  userId: string,
  input: UpdateDebtInput
) {
  const prisma = db as import("@prisma/client").PrismaClient;
  const existing = await prisma.debt.findFirst({ where: { id, userId, deletedAt: null } });
  if (!existing) return null;
  return prisma.debt.update({
    where: { id, userId },
    data: {
      counterparty: input.counterparty,
      amountUzs: input.amountUzs,
      note: input.note,
      occurredAt: input.occurredAt,
      direction: input.direction,
    },
  });
}

export async function deleteDebt(id: string, userId: string) {
  const prisma = db as import("@prisma/client").PrismaClient;
  const existing = await prisma.debt.findFirst({
    where: { id, userId, deletedAt: null },
  });
  if (!existing) return null;
  await prisma.debt.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  return true;
}

export async function getDebtTotals(userId: string): Promise<DebtTotals> {
  const prisma = db as import("@prisma/client").PrismaClient;

  // Fetch all open debts with their payments in one query
  const openDebts = await prisma.debt.findMany({
    where: { userId, status: DebtStatus.open, deletedAt: null },
    select: {
      direction: true,
      amountUzs: true,
      payments: {
        where: { deletedAt: null },
        select: { amountUzs: true },
      },
    },
  });

  let givenOpen = 0n;
  let takenOpen = 0n;

  for (const debt of openDebts) {
    const totalPaid = debt.payments.reduce((sum, p) => sum + (p.amountUzs as bigint), 0n);
    const remaining = (debt.amountUzs as bigint) - totalPaid;
    const rem = remaining > 0n ? remaining : 0n;
    if (debt.direction === DebtDirection.given) givenOpen += rem;
    else takenOpen += rem;
  }

  return { givenOpen, takenOpen };
}

export async function getDebtWithPayments(debtId: string, userId: string) {
  const prisma = db as import("@prisma/client").PrismaClient;
  const debt = await prisma.debt.findFirst({
    where: { id: debtId, userId, deletedAt: null },
    include: {
      payments: {
        where: { deletedAt: null },
        orderBy: { occurredAt: "desc" },
      },
    },
  });
  if (!debt) return null;
  const totalPaid = debt.payments.reduce((sum, p) => sum + (p.amountUzs as bigint), 0n);
  const remaining = (debt.amountUzs as bigint) - totalPaid;
  return { ...debt, remaining: remaining > 0n ? remaining : 0n };
}

export async function addDebtPayment(input: AddDebtPaymentInput) {
  const prisma = db as import("@prisma/client").PrismaClient;

  // Validate ownership + existence
  const debt = await prisma.debt.findFirst({
    where: { id: input.debtId, userId: input.userId, deletedAt: null },
    include: {
      payments: { where: { deletedAt: null }, select: { amountUzs: true } },
    },
  });
  if (!debt) return null;

  if (input.amountUzs <= 0n) {
    throw new Error("AMOUNT_INVALID");
  }

  const totalPaid = debt.payments.reduce((sum, p) => sum + (p.amountUzs as bigint), 0n);
  const remaining = (debt.amountUzs as bigint) - totalPaid;

  if (input.amountUzs > remaining) {
    throw new Error("EXCEEDS_REMAINING");
  }

  const newTotalPaid = totalPaid + input.amountUzs;
  const fullyPaid = newTotalPaid >= (debt.amountUzs as bigint);

  const [payment, updatedDebt] = await prisma.$transaction([
    prisma.debtPayment.create({
      data: {
        debtId: input.debtId,
        amountUzs: input.amountUzs,
        occurredAt: input.occurredAt,
        note: input.note ?? null,
      },
    }),
    prisma.debt.update({
      where: { id: input.debtId },
      data: fullyPaid
        ? { status: DebtStatus.settled, settledAt: new Date() }
        : {},
    }),
  ]);

  return { payment, debt: updatedDebt };
}

export async function deleteDebtPayment(paymentId: string, userId: string) {
  const prisma = db as import("@prisma/client").PrismaClient;

  // Find the payment and verify ownership via the debt
  const payment = await prisma.debtPayment.findFirst({
    where: { id: paymentId, deletedAt: null },
    include: { debt: { select: { id: true, userId: true, amountUzs: true, status: true } } },
  });
  if (!payment || payment.debt.userId !== userId) return null;

  // Soft-delete the payment
  const deleted = await prisma.debtPayment.update({
    where: { id: paymentId },
    data: { deletedAt: new Date() },
  });

  // Recalculate: if debt was settled, check whether it's still fully paid
  if (payment.debt.status === DebtStatus.settled) {
    const remaining = await prisma.debtPayment.aggregate({
      where: { debtId: payment.debt.id, deletedAt: null },
      _sum: { amountUzs: true },
    });
    const totalPaid = (remaining._sum.amountUzs ?? 0n) as bigint;
    if (totalPaid < (payment.debt.amountUzs as bigint)) {
      await prisma.debt.update({
        where: { id: payment.debt.id },
        data: { status: DebtStatus.open, settledAt: null },
      });
    }
  }

  return deleted;
}
