import { Prisma } from "@prisma/client";
import { db } from "../db";

// Prisma JSON-compatible draft type
export type PendingDraft = Prisma.InputJsonObject;

export async function getPendingAction(userId: string) {
  const prisma = db as import("@prisma/client").PrismaClient;
  const action = await prisma.pendingAction.findUnique({ where: { userId } });
  if (!action) return null;
  if (action.expiresAt < new Date()) {
    await prisma.pendingAction.delete({ where: { userId } });
    return null;
  }
  return action;
}

export async function upsertPendingAction(
  userId: string,
  data: {
    intent: string;
    draft: PendingDraft;
    question: string;
    lastTransactionId?: string | null;
  }
): Promise<void> {
  const prisma = db as import("@prisma/client").PrismaClient;
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // +15 minutes
  await prisma.pendingAction.upsert({
    where: { userId },
    create: {
      userId,
      intent: data.intent,
      draft: data.draft,
      question: data.question,
      lastTransactionId: data.lastTransactionId ?? null,
      expiresAt,
    },
    update: {
      intent: data.intent,
      draft: data.draft,
      question: data.question,
      lastTransactionId: data.lastTransactionId ?? null,
      expiresAt,
    },
  });
}

export async function clearPendingAction(userId: string): Promise<void> {
  const prisma = db as import("@prisma/client").PrismaClient;
  await prisma.pendingAction.deleteMany({ where: { userId } });
}
