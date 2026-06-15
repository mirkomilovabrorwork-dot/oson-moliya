import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { db } from "../db";
import { assertInsecureDevBlocked } from "../env";

const COOKIE_NAME = "pultrack_session";
const SESSION_DAYS = 30;

/** Sentinel Telegram ID used for the seeded dev user (local dev only). */
const DEV_TELEGRAM_ID = BigInt(999999999);

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Creates a new session for the user.
 * Sets the `pultrack_session` cookie.
 */
export async function createSession(userId: string): Promise<void> {
  const prisma = db as import("@prisma/client").PrismaClient;
  const raw = randomBytes(32).toString("hex");
  const tokenHash = sha256(raw);
  const expiresAt = new Date(
    Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000
  );

  await prisma.session.create({ data: { userId, tokenHash, expiresAt } });

  const cookieStore = await cookies();
  // Inside Telegram's in-app WebView the cookie is sent cross-context (the WebView
  // is embedded in the Telegram app, not a top-level browser frame). SameSite=Lax
  // blocks those requests, so we switch to SameSite=None; Secure in production.
  // On localhost (http) SameSite=None is invalid without Secure, so we keep Lax.
  const isHttps =
    process.env.NODE_ENV === "production" ||
    (process.env.APP_URL ?? "").startsWith("https://");
  cookieStore.set(COOKIE_NAME, raw, {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? "none" : "lax",
    path: "/",
    expires: expiresAt,
  });
}

/**
 * Reads the session cookie and returns the associated User or null.
 * Can be called from Server Components and Route Handlers.
 *
 * DEV BYPASS: when ALLOW_INSECURE_DEV=1 and NODE_ENV!=='production',
 * returns a seeded dev user if no valid session cookie is present.
 * This is HARD-BLOCKED in production (assertInsecureDevBlocked throws on startup).
 */
export async function getSessionUser() {
  const prisma = db as import("@prisma/client").PrismaClient;
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;

  // Normal path — validate cookie.
  if (raw) {
    const tokenHash = sha256(raw);
    const session = await prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!session) {
      // fall through to dev bypass check below
    } else if (session.expiresAt < new Date()) {
      await prisma.session.delete({ where: { tokenHash } });
      // fall through to dev bypass check below
    } else {
      return session.user;
    }
  }

  // DEV BYPASS — only active when ALLOW_INSECURE_DEV=1 AND not production.
  // assertInsecureDevBlocked() is called by getEnv() at startup; the double-check
  // here is a defence-in-depth guard in case startup was skipped in tests.
  assertInsecureDevBlocked();
  if (
    process.env.ALLOW_INSECURE_DEV === "1" &&
    process.env.NODE_ENV !== "production"
  ) {
    // Get-or-create a stable seeded dev user so the DB always has this row.
    const devUser = await prisma.user.upsert({
      where: { telegramId: DEV_TELEGRAM_ID },
      update: {},
      create: {
        telegramId: DEV_TELEGRAM_ID,
        firstName: "Dev",
        username: "dev_user",
        language: "uz",
        displayCurrency: "UZS",
      },
    });
    return devUser;
  }

  return null;
}

/**
 * Destroys the current session.
 */
export async function destroySession(): Promise<void> {
  const prisma = db as import("@prisma/client").PrismaClient;
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  if (raw) {
    const tokenHash = sha256(raw);
    await prisma.session.deleteMany({ where: { tokenHash } });
  }
  cookieStore.delete(COOKIE_NAME);
}
