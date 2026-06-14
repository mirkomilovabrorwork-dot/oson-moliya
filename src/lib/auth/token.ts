import { createHash, randomBytes, randomInt } from "crypto";
import { db } from "../db";

const LOGIN_CODE_TTL_MS = 10 * 60 * 1000;

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
 * Issues a short one-time login code for users who open Telegram outside
 * the Mini App flow. The code is still stored hashed and consumed once.
 */
export async function issueLoginCode(userId: string): Promise<string> {
  const prisma = db as import("@prisma/client").PrismaClient;
  const expiresAt = new Date(Date.now() + LOGIN_CODE_TTL_MS);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = String(randomInt(100000, 1000000));
    const tokenHash = sha256(code);

    try {
      // The same 6-digit code can safely be reused after its previous token was
      // used or expired. Active collisions retry below.
      await prisma.magicToken.deleteMany({
        where: {
          tokenHash,
          OR: [{ usedAt: { not: null } }, { expiresAt: { lte: new Date() } }],
        },
      });
      await prisma.magicToken.create({
        data: { userId, tokenHash, expiresAt },
      });
      return code;
    } catch {
      // tokenHash is unique; retry if another active code already uses it.
    }
  }

  throw new Error("Could not issue login code");
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
