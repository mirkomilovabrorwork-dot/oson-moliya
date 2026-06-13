import { webhookCallback } from "grammy";
import { getBot } from "@/lib/telegram/bot";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request): Promise<Response> {
  // Verify Telegram secret token
  try {
    const env = getEnv();
    const secretHeader = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (!secretHeader || secretHeader !== env.TELEGRAM_WEBHOOK_SECRET) {
      console.warn("Telegram webhook: invalid secret token");
      return new Response("Unauthorized", { status: 401 });
    }
  } catch (err) {
    console.error("Telegram webhook: env error", err);
    // Still return 200 per spec to avoid Telegram retries
    return new Response("OK", { status: 200 });
  }

  try {
    const bot = getBot();
    const handler = webhookCallback(bot, "std/http");
    // AWAIT so any async rejection (e.g. a failed sendMessage when a chat is gone)
    // is caught here and we still return 200 — Telegram must never see a 500/retry.
    return await handler(request);
  } catch (err) {
    console.error("Telegram webhook: handler error", err);
    // Always return 200 so Telegram doesn't keep retrying.
    return new Response("OK", { status: 200 });
  }
}
