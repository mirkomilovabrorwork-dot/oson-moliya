#!/usr/bin/env tsx
/**
 * Sets the bot's default Menu Button to the Web App (Mini App).
 *
 * Run after deploy:
 *   npx tsx scripts/set-menu.ts
 *
 * Requires in environment (or .env.local):
 *   TELEGRAM_BOT_TOKEN
 *   APP_URL   (must be https:// for web_app to work)
 */

import "dotenv/config";

const token = process.env.TELEGRAM_BOT_TOKEN;
const appUrl = process.env.APP_URL;

if (!token) {
  console.error("Missing TELEGRAM_BOT_TOKEN");
  process.exit(1);
}

if (!appUrl) {
  console.error("Missing APP_URL");
  process.exit(1);
}

if (!appUrl.startsWith("https://")) {
  console.error(`APP_URL must start with https:// (got: ${appUrl})`);
  process.exit(1);
}

async function setMenuButton(): Promise<void> {
  const res = await fetch(
    `https://api.telegram.org/bot${token}/setChatMenuButton`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        menu_button: {
          type: "web_app",
          text: "Dashboard",
          web_app: { url: appUrl },
        },
      }),
    }
  );

  const data = (await res.json()) as { ok: boolean; description?: string };
  if (data.ok) {
    console.log(`✅ Menu button set to web_app: ${appUrl}`);
  } else {
    console.error("❌ Failed to set menu button:", data.description);
    process.exit(1);
  }
}

setMenuButton().catch((err: unknown) => {
  console.error("Error:", err);
  process.exit(1);
});
