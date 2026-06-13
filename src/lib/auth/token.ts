import { createHash, randomBytes } from "crypto";
import { db } from "../db";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Issues a magic token for one-time login.
 * Returns the raw token (to embed in the URL).
 */
export async function issueMagicToken(userId: string): Promise<string> {
  const prisma = db as import("@prisma/client").PrismaClient;
  const raw = randomBytes(32).toString("hex");
  const tokenHash = sha256(raw);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // +10 minutes

  await prisma.magicToken.create({ data: { userId, tokenHash, expiresAt } });
  return raw;
}

/**
 * Consumes a magic token.
 * Returns the userId if valid and unused; null otherwise.
 */
export async function consumeMagicToken(raw: string): Promise<string | null> {
  const prisma = db as import("@prisma/client").PrismaClient;
  const tokenHash = sha256(raw);
  const token = await prisma.magicToken.findUnique({ where: { tokenHash } });

  if (!token) return null;
  if (token.usedAt) return null;
  if (token.expiresAt < new Date()) return null;

  await prisma.magicToken.update({
    where: { tokenHash },
    data: { usedAt: new Date() },
  });

  return token.userId;
}
