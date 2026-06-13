#!/usr/bin/env tsx
/**
 * Sets the Telegram webhook to APP_URL/api/telegram
 * Run manually: npx tsx scripts/set-webhook.ts
 * Requires: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, APP_URL in environment
 */

import "dotenv/config"; // loads .env from cwd

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const appUrl = process.env.APP_URL;

if (!token || !secret || !appUrl) {
  console.error(
    "Missing required env vars: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, APP_URL"
  );
  process.exit(1);
}

const webhookUrl = `${appUrl}/api/telegram`;

async function setWebhook(): Promise<void> {
  const res = await fetch(
    `https://api.telegram.org/bot${token}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secret,
        allowed_updates: ["message", "callback_query"],
      }),
    }
  );

  const data = (await res.json()) as { ok: boolean; description?: string };
  if (data.ok) {
    console.log(`✅ Webhook set to: ${webhookUrl}`);
  } else {
    console.error("❌ Failed to set webhook:", data.description);
    process.exit(1);
  }
}

setWebhook().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
