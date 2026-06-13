#!/usr/bin/env tsx
/**
 * Local development: run the Telegram bot in long-polling mode.
 * No public HTTPS / webhook needed — ideal for testing before deploy.
 *
 *   npm run bot:dev
 *
 * Loads .env, deregisters any existing webhook (otherwise getUpdates returns 409),
 * then starts polling.
 */
import "dotenv/config";
import { getBot } from "../src/lib/telegram/bot";

async function main(): Promise<void> {
  const bot = getBot();
  // A webhook and long-polling are mutually exclusive — drop the webhook first.
  await bot.api.deleteWebhook();
  console.log("Webhook removed. Starting long-polling…");
  await bot.start({
    onStart: (info) => console.log(`✅ Bot @${info.username} is polling. Send it a message.`),
  });
}

main().catch((err) => {
  console.error("bot:dev failed:", err);
  process.exit(1);
});
