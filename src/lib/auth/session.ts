import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { db } from "../db";

const COOKIE_NAME = "pultrack_session";
const SESSION_DAYS = 30;

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
 */
export async function getSessionUser() {
  const prisma = db as import("@prisma/client").PrismaClient;
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  const tokenHash = sha256(raw);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { tokenHash } });
    return null;
  }

  return session.user;
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
