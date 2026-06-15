#!/usr/bin/env tsx
/**
 * One-time post-deploy setup for the Telegram bot UI.
 *
 * Sets:
 *   1. Chat menu button → type "commands" (shows "/" command list, NOT the web_app)
 *   2. Bot commands (uz default; ru + en variants) so the menu lists them clearly
 *
 * Run after every deploy:
 *   npm run setup-bot
 *
 * Requires in .env (or environment):
 *   TELEGRAM_BOT_TOKEN
 */

import "dotenv/config";

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error("Missing TELEGRAM_BOT_TOKEN");
  process.exit(1);
}

const BASE = `https://api.telegram.org/bot${token}`;

async function post(method: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${BASE}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { ok: boolean; description?: string };
  if (data.ok) {
    console.log(`✅ ${method} — OK`);
  } else {
    console.error(`❌ ${method} failed:`, data.description);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  // 1. Menu button → "commands" (shows "/" command list in Telegram)
  await post("setChatMenuButton", {
    menu_button: { type: "commands" },
  });

  // 2. Default commands (Uzbek, shown when no language_code matches)
  await post("setMyCommands", {
    commands: [
      { command: "start",    description: "Botni ishga tushirish" },
      { command: "hisobot",  description: "📊 Oylik hisobot (Excel)" },
      { command: "yordam",   description: "❓ Yordam va buyruqlar" },
      { command: "til",      description: "🌐 Tilni o'zgartirish" },
      { command: "dashboard", description: "📈 Moliya panelini ochish" },
    ],
  });

  // 3. Russian commands
  await post("setMyCommands", {
    language_code: "ru",
    commands: [
      { command: "start",    description: "Запустить бота" },
      { command: "hisobot",  description: "📊 Месячный отчёт (Excel)" },
      { command: "help",     description: "❓ Помощь и команды" },
      { command: "language", description: "🌐 Сменить язык" },
      { command: "dashboard", description: "📈 Открыть панель" },
    ],
  });

  // 4. English commands
  await post("setMyCommands", {
    language_code: "en",
    commands: [
      { command: "start",    description: "Start the bot" },
      { command: "hisobot",  description: "📊 Monthly report (Excel)" },
      { command: "help",     description: "❓ Help & command list" },
      { command: "language", description: "🌐 Change language" },
      { command: "dashboard", description: "📈 Open dashboard" },
    ],
  });

  console.log("\nBot setup complete. Menu button = commands; commands registered for uz/ru/en.");
}

main().catch((err: unknown) => {
  console.error("setup-bot failed:", err);
  process.exit(1);
});
