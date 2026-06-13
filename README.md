# PulTrack — Telegram Finance Manager for Uzbekistan SMBs

PulTrack is a trilingual (Uzbek / Russian / English) finance-tracking tool built for Uzbekistan small businesses. Users log income and expenses by sending text or voice messages to a Telegram bot in Uzbek, Russian, or English; the bot's Claude-powered brain understands natural-language amounts (including shorthands like "500 ming", "2 mln"), detects the category, asks a single clarifying question when needed, and confirms the transaction. A magic-link in the bot's reply opens a multi-page web dashboard — Overview, Transactions, Analytics, and Categories — where the user sees all their data, charts, per-category budget limits, and proactive overspend alerts, all in three languages.

---

## Key Features

### Telegram bot
- Text and voice input (Groq Whisper STT, swappable to OpenAI)
- Language auto-detection: Uzbek, Russian, English per message
- Amount shorthand expansion: `ming` ×1000, `mln`/`млн` ×1 000 000, `mlrd` ×10⁹, `yarim` = 0.5
- Intent detection via Claude tool-use: log income/expense, query totals/reports, correct or delete the last transaction, add custom categories
- Single-step clarification loop for missing fields (amount, type)
- UZS-only guard: asks the user to convert foreign-currency amounts before logging
- Custom categories (canonical lowercased, cross-language reuse)
- Proactive budget alerts when a category's monthly spend crosses the limit (once per category per month)
- Finance query and report: ask "this month's expenses?" or "hisobot" for a multi-line summary

### Web dashboard
- **Overview** — income/expense/net stat cards with month-on-month comparison; quick-add form; budget progress bars
- **Transactions** — full table with type/category/date filters, text search over note/category, pagination, inline edit and delete
- **Analytics** — income vs expense bar chart, category pie, net trend line; period selector (this month / last month / this year / custom)
- **Categories** — create, rename, delete categories; set monthly budget limits per category
- **Onboarding** — new-user empty state with example bot messages and a deep link to the bot
- Full Uzbek / Russian / English UI; persists via `pultrack_lang` cookie; independent of bot reply language

---

## Architecture

One Next.js 16 app serves everything:

```
Telegram  ──POST──►  /api/telegram (webhook)
                          │
                          ▼
                    Claude brain (tool-use)
                    Groq Whisper (voice → text)
                    Prisma 6 → Neon Postgres
                          │
                          ▼
Browser  ──HTTPS──►  Next.js App Router
                    Dashboard pages (SSR, force-dynamic)
                    /api/* Route Handlers
                    Auth: magic-link (bot button) → HttpOnly session cookie
```

- **Single repo, single deploy** (Vercel). Dashboard + API + Telegram webhook share the same Next.js process and the same Neon Postgres database.
- **Auth:** the bot issues a one-time magic-link (10 min TTL); clicking it sets a 30-day HttpOnly session cookie. No passwords, no OAuth.
- **Brain:** every bot message goes to Claude via forced tool-use (`record_intent`). The structured output is validated with zod before any DB write — the model never writes SQL.
- **Voice:** Telegram sends OGG audio; the server downloads it and forwards the buffer to Groq Whisper (`whisper-large-v3`, language autodetect). The transcript is fed into the same brain path as text.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript) |
| Styling | Tailwind CSS v4 |
| Charts | Recharts |
| Database | Neon Postgres (serverless) via Prisma 6 + `@prisma/adapter-neon` |
| AI brain | Anthropic Claude (`claude-haiku-4-5-20251001` default, tool-use) |
| Voice STT | Groq Whisper (`whisper-large-v3`); swappable to OpenAI |
| Bot framework | grammY |
| Deploy | Vercel |
| Test runner | Vitest |

---

## Local Setup

> **Windows / PowerShell note:** Node.js may not be on the default PATH in some shells. Prefix every `npm`/`npx`/`prisma` command with:
> ```powershell
> $env:Path = "C:\Program Files\nodejs;" + $env:Path
> ```

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Fill in the values — see Environment Variables below
```

### 3. Migrate the database

```bash
npx prisma migrate dev
```

> Requires a live `DATABASE_URL`. See "Environment Variables" for how to get a free Neon connection string.

### 4. Start the dashboard (web + API)

```bash
npm run dev
```

Opens at [http://localhost:3000](http://localhost:3000).

### 5. Start the bot (local long-polling)

In a separate terminal:

```bash
npm run bot:dev
```

This uses grammY long-polling — no public HTTPS URL needed for local testing.

---

## Production Deploy

### Vercel + Neon

1. Create a Neon project; copy the **pooled** connection string to `DATABASE_URL` and the **unpooled** one to `DIRECT_URL`.
2. Push to GitHub; import the repo into Vercel.
3. Add all environment variables from `.env.example` in the Vercel dashboard (Project → Settings → Environment Variables).
4. Deploy. Vercel runs `prisma generate && next build` automatically.

### Register the Telegram webhook

After your first Vercel deploy, run once (locally, with `.env` pointing at prod values):

```bash
npm run set-webhook
```

This calls `setWebhook` on Telegram pointing to `${APP_URL}/api/telegram` with the correct `secret_token`.

> To switch back to long-polling (local dev), just run `npm run bot:dev` — it deregisters the webhook automatically.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Neon **pooled** connection string (`?sslmode=require`) |
| `DIRECT_URL` | Yes | Neon **unpooled** connection string (used by `prisma migrate` only) |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key — powers the bot brain |
| `CLAUDE_MODEL` | No | Claude model ID (default: `claude-haiku-4-5-20251001`) |
| `GROQ_API_KEY` | Yes (voice) | Groq API key for Whisper STT |
| `STT_PROVIDER` | No | `groq` (default) or `openai` |
| `TELEGRAM_BOT_TOKEN` | Yes | Bot token from @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Yes | Random string — verified on every webhook POST |
| `APP_URL` | Yes | Public base URL: `https://<project>.vercel.app` in prod, `http://localhost:3000` locally |
| `AUTH_SECRET` | Yes | Random 32+ char string — HMAC key for magic-link and session tokens |

---

## Live Demo

| | |
|---|---|
| **Telegram bot** | [@oson_moliya_bot](https://t.me/oson_moliya_bot) |
| **Dashboard URL** | [oson-moliya.vercel.app](https://oson-moliya.vercel.app) |

---

## Known Limitations

- **Uzbek STT accuracy is moderate.** Groq Whisper handles Uzbek reasonably but may mis-transcribe uncommon words; the confirmation message lets users catch errors.
- **UZS only.** Foreign-currency amounts (dollars, euros, rubles) are rejected with a clarification prompt — the user must convert manually.
- **Single-user workspace.** Each Telegram user has their own isolated data. Team/multi-user workspaces are not yet implemented.
