import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

const KEY_LEN = 64;
const SALT_BYTES = 16;

/**
 * Hash a password with scrypt + a random per-password salt.
 * Returns "saltHex:hashHex". Zero external deps (Node crypto only).
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  const derived = (await scryptAsync(password, salt, KEY_LEN)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

/**
 * Verify a password against a stored "saltHex:hashHex" value.
 * Constant-time compare; returns false on any malformed input (never throws).
 */
export async function verifyPassword(
  password: string,
  stored: string | null | undefined
): Promise<boolean> {
  if (!stored) return false;
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  let storedBuf: Buffer;
  try {
    storedBuf = Buffer.from(hashHex, "hex");
  } catch {
    return false;
  }
  const derived = (await scryptAsync(password, salt, KEY_LEN)) as Buffer;
  if (storedBuf.length !== derived.length) return false;
  return timingSafeEqual(storedBuf, derived);
}

/** Normalize a chosen login name: trim + lowercase. */
export function normalizeLoginName(loginName: string): string {
  return loginName.trim().toLowerCase();
}

/** Valid login name = 3–20 chars, lowercase letters/digits/underscore (after normalize). */
export function isValidLoginName(loginName: string): boolean {
  return /^[a-z0-9_]{3,20}$/.test(normalizeLoginName(loginName));
}

/** Minimum password strength: at least 8 characters. */
export function isValidPassword(password: string): boolean {
  return typeof password === "string" && password.length >= 8;
}
