import type { Api } from "grammy";
import { getTashkentNow } from "../dates";

/**
 * Owner Telegram chat — receives forwarded /feedback AND prod error alerts.
 * Single source of truth: bot.ts imports OWNER_CHAT_ID from here.
 */
export const OWNER_CHAT_ID = 8582045913;

// Throttle: never DM the same error more than once per window. In-memory and
// best-effort — it resets on serverless cold start, which is fine. The goal is
// only "don't spam the owner", not perfect dedupe.
const THROTTLE_MS = 5 * 60 * 1000;
const lastSentAt = new Map<string, number>();

function summarize(err: unknown): { name: string; message: string; stackLine: string } {
  if (err instanceof Error) {
    const stackLine = (err.stack ?? "")
      .split("\n")
      .slice(1, 3)
      .map((s) => s.trim())
      .join(" | ");
    return { name: err.name, message: err.message, stackLine };
  }
  return { name: "NonError", message: String(err), stackLine: "" };
}

/**
 * DM the product owner about an uncaught / production error.
 *
 * NEVER throws — every failure (send error, throttle map, formatting) is swallowed,
 * so this is safe to call from inside any catch block on the request path.
 *
 * @param api      a grammy Api (ctx.api or bot.api)
 * @param context  where it happened, e.g. "telegram-webhook:handler_error"
 * @param err      the caught error
 */
export async function notifyOwnerError(api: Api, context: string, err: unknown): Promise<void> {
  try {
    const { name, message, stackLine } = summarize(err);

    const key = `${context}:${name}:${message}`.slice(0, 200);
    const now = Date.now();
    const prev = lastSentAt.get(key);
    if (prev !== undefined && now - prev < THROTTLE_MS) return; // throttled
    lastSentAt.set(key, now);

    const when = getTashkentNow().toISOString().replace("T", " ").slice(0, 19);
    const body =
      `🚨 PulTrack — prod xato\n` +
      `Joy: ${context}\n` +
      `Xato: ${name}: ${message}` +
      (stackLine ? `\n${stackLine}` : "") +
      `\n⏰ ${when} (Tashkent)`;

    // Plain text (no parse_mode) so arbitrary error text never breaks formatting.
    await api.sendMessage(OWNER_CHAT_ID, body.slice(0, 3500));
  } catch {
    // swallow — alerting must never break the request path
  }
}
