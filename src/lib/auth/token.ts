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
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // +30 minutes

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

  // Atomic single-use consume: the updateMany only matches an UNUSED, UNEXPIRED
  // token, so two concurrent requests can never both succeed (only one gets
  // count === 1). This closes the findUnique→update race condition.
  const result = await prisma.magicToken.updateMany({
    where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (result.count === 0) return null;

  const token = await prisma.magicToken.findUnique({
    where: { tokenHash },
    select: { userId: true },
  });
  return token?.userId ?? null;
}
