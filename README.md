# Oson Moliya — Telegram Finance Manager for Uzbekistan SMBs

> **Internal codename: PulTrack** (repo and some docs use it; the shipped product is "Oson Moliya".)

---

## Assessment links / Topshiriq havolalari

| | |
|---|---|
| **Live dashboard** | [oson-moliya.vercel.app](https://oson-moliya.vercel.app) |
| **Telegram bot** | [@oson_moliya_bot](https://t.me/oson_moliya_bot) |
| **GitHub repo** | [github.com/mirkomilovabrorwork-dot/oson-moliya](https://github.com/mirkomilovabrorwork-dot/oson-moliya) |
| **Product brief** | [`docs/product-brief.md`](docs/product-brief.md) |
| **3-more-days roadmap** | [`docs/three-more-days.md`](docs/three-more-days.md) |
| **Screen recording** | _(placeholder — link will be added before submission)_ |

---

## Assessment checklist

Maps each Task-01 requirement to where you can see it in the live app.

| # | Requirement | Where to verify |
|---|---|---|
| 1 | Bot text input | Send any Uzbek/Russian/English message to @oson_moliya_bot |
| 2 | Bot voice + STT | Send a voice message; bot echoes `🎤 {transcript}` then `✅ Yozildi: …` |
| 3 | Intent detection | Bot classifies income, expense, query, correction, deletion via Claude tool-use |
| 4 | Capture amount / type / category / date / note | Confirmed in the `✅ Yozildi` reply; visible in Transactions |
| 5 | Natural-language reply with confirmation | Every save: `✅ Yozildi: [category] [amount] ([type])` |
| 6 | Follow-up when unclear | Send "logistikaga chiqim" (no amount) → bot asks "Qancha so'm?" |
| 7 | Finance query | Send "hisobot" or "bu oy chiqimlar" → multi-line summary with "Sof (kirim−chiqim)" |
| 8 | Correction / deletion | Send "oxirgisini 900 ming deb tuzat" or "o'chir" |
| 9 | Custom categories | /more → Kategoriyalar → "+" to add; use custom category name in a bot message |
| 10 | Overview — income / expense / net / period comparison / quick-add | Home screen: "Bu oy natijasi" hero + period delta line + FAB (➕) |
| 11 | Transactions list / filters / search / edit / delete | /transactions — type, category, date filters; text search; inline edit & delete |
| 12 | Analytics | /analytics — income vs expense bar chart, category pie, net trend, period selector |
| 13 | Categories management | /more → Kategoriyalar — create, rename, delete; set monthly budget limits |
| 14 | Onboarding empty state | Open the dashboard as a brand-new user (no records) |
| 15 | +1 budget alert | Set a budget, exceed it via bot → Telegram message fires once per category per month |
| 16 | README + brief + 3-more-days | This file; `docs/product-brief.md`; `docs/three-more-days.md` |
| 17 | Live bot + dashboard + repo access | URLs in the table above; repo is accessible to evaluators |

---

## Product overview

Oson Moliya lets an Uzbek small-business owner track money by talking or typing to a Telegram bot
("250 ming logistikaga chiqim") and see a calm, trustworthy money picture on a phone dashboard.
It is trilingual (Uzbek / Russian / English): the user sets their language once; the bot auto-detects
the language of each message independently.

---

## Key Features

### Telegram bot
- Text and voice input (Groq Whisper STT, swappable to OpenAI via `STT_PROVIDER`)
- Language auto-detection: Uzbek, Russian, English per message
- Amount shorthand expansion: `ming` ×1 000, `mln`/`млн` ×1 000 000, `mlrd` ×10⁹, `yarim` = 0.5
- Intent detection via Claude forced tool-use: log income/expense, query totals/reports, correct or
  delete the last transaction, add custom categories
- Single-step clarification loop for missing fields (amount, type) — text-based, confirmed on camera
- UZS-only guard: foreign-currency tokens (dollar, euro, rubl) trigger a clarification prompt rather
  than silently logging the numeric digits as so'm
- Custom categories (canonical lowercased, cross-language reuse)
- Proactive budget alerts when a category's monthly spend reaches the limit (once per category per
  month; fires at 100% or above)
- Finance query and report: "hisobot" returns income, expense, and "Sof (kirim−chiqim)" net

### Web dashboard
- **Overview** — "Bu oy natijasi" hero (this month's net income minus expense), income/expense
  sub-lines, period-over-period delta with correct financial guards (no Infinity%, no % across sign
  flip), quick-add FAB, budget progress bars
- **Transactions** — full table with type/category/date filters, text search over note/category,
  pagination, inline edit and delete; mobile-card layout + desktop table
- **Analytics** — income vs expense bar chart, category expense pie, net trend line; period selector
  (this month / last month / this year / custom)
- **Categories** — create, rename, delete; set monthly budget limits per category
- **Onboarding** — new-user empty state with example bot messages and a deep link to the bot
- Full Uzbek / Russian / English UI; persists via `pultrack_lang` cookie

---

## What "net" means (cash basis)

Oson Moliya is a **cash-flow tracker (cash basis)**: every record is real money in or out at the
moment it happened. "Bu oy natijasi" equals this month's total income minus this month's total
expense — it is **not** an account balance and not an accounting profit. Transfers between accounts,
debts and receivables, and a true running balance across all cashboxes are on the 3-day roadmap
(`docs/three-more-days.md`).

---

## Why Claude + Groq instead of OpenAI

**Structured output via forced tool-use + zod.** Every bot message goes to Claude with a
`record_intent` tool schema; Claude must call the tool, and the result is validated with zod before
any DB write. This is functionally equivalent to OpenAI structured-output / function-calling — the
model never writes SQL, and a malformed response is rejected cleanly.

**STT is swappable.** Voice goes to Groq Whisper (`whisper-large-v3`) by default, but the
`STT_PROVIDER=openai` environment variable switches the same interface to OpenAI Whisper with no
code change. The choice is cost and Uzbek-language accuracy: in testing Groq's Whisper handled
Uzbek phone audio reliably at lower latency than the OpenAI endpoint at the time of development.

**Cost.** Claude Haiku (the default model) is among the cheapest available models that reliably
follows a multi-field tool schema in three languages including Uzbek.

---

## Architecture

One Next.js 16 app serves everything:

```
Telegram  ──POST──►  /api/telegram (webhook)
                          │
                          ▼
                    Claude brain (forced tool-use + zod)
                    Groq Whisper (voice → text)
                    Prisma 6 → Neon Postgres
                          │
                          ▼
Browser  ──HTTPS──►  Next.js App Router
                    Dashboard pages (SSR, force-dynamic)
                    /api/* Route Handlers
                    Auth: Telegram initData HMAC (primary)
                          magic-link (non-Telegram / localhost fallback)
```

- **Single repo, single deploy** (Vercel). Dashboard + API + Telegram webhook share the same
  Next.js process and the same Neon Postgres database.
- **Brain:** every bot message goes to Claude via forced tool-use (`record_intent`). The structured
  output is validated with zod before any DB write — the model never writes SQL.
- **Voice:** Telegram sends OGG audio; the server downloads it and forwards the buffer to Groq
  Whisper (`whisper-large-v3`, language autodetect). The transcript feeds the same brain path as text.

---

## Authentication

**Primary production path: Telegram WebApp initData HMAC validation.**  
When the dashboard opens inside the Telegram Mini App, the client sends the raw
`window.Telegram.WebApp.initData` string to `POST /api/auth/telegram`. The server verifies the
HMAC-SHA256 signature against the bot token per Telegram's official algorithm, then upserts the user
and issues a 30-day HttpOnly session cookie. initData includes a `auth_date` field; the server
enforces a **24-hour freshness window** — initData older than 24 h is rejected. Replays within that
window are accepted as standard Mini App behaviour; the only state change is an idempotent session
upsert.

**Non-Telegram / localhost fallback: magic-link.**  
`/api/auth/verify` (`token.ts`, `reply.ts`) is still present in code as a fallback for browser
testing outside the Telegram WebView. The magic-link is short-TTL and single-use (consumed on first
redemption). It is not the primary demo path and no magic-link URL appears on screen during the
recorded demo.

---

## Security and conscious trade-offs

- **SameSite=None cookie + same-origin guard.** The session cookie uses `SameSite=None; Secure` in
  production so it is sent inside Telegram's embedded WebView (a cross-site frame). To mitigate the
  CSRF exposure that comes with `SameSite=None`, every mutating API route (POST/PATCH/DELETE on
  transactions, categories, and budgets) checks the `Origin` or `Referer` header against `APP_URL`
  via `assertSameOrigin()` and returns 403 on mismatch. Telegram WebView requests carry the Mini
  App's own origin and are unaffected.
- **initData 24-hour replay window.** initData is not single-use — a valid signature is accepted
  for up to 24 hours. The only write on auth is an idempotent user upsert, so the practical risk
  is minimal; nonce/single-use initData is on the Phase 4 hardening list.
- **500-row view cap.** The Transactions page currently fetches the most-recent 500 records on the
  server side. Server-side pagination and full-text search are on the roadmap; the cap is a
  conscious first-ship trade-off.
- **Rate-limiting / spend caps.** The public bot calls Groq STT + Claude on every message. A basic
  per-user sliding window and global daily counter are in place. Provider-side spend caps on both
  the Anthropic and Groq keys are set to ensure a cost spike cannot fail the live demo.
- **Magic-link issuance rate-limit and token-in-chat-history risk** are known limitations noted for
  Phase 4 hardening.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript) |
| Styling | Tailwind CSS v4 |
| Charts | Recharts |
| Database | Neon Postgres (serverless) via Prisma 6 + `@prisma/adapter-neon` |
| AI brain | Anthropic Claude (`claude-haiku-4-5-20251001` default, forced tool-use) |
| Voice STT | Groq Whisper (`whisper-large-v3`); swappable to OpenAI via `STT_PROVIDER` |
| Bot framework | grammY |
| Deploy | Vercel |
| Test runner | Vitest |

---

## Local Setup

> **Windows / PowerShell:** Node.js may not be on the default PATH. Prefix every `npm`/`npx`/`prisma`
> command with:
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

> Requires a live `DATABASE_URL`. See "Environment Variables" for how to get a free Neon string.

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

Uses grammY long-polling — no public HTTPS URL needed for local testing.

---

## Production Deploy

### Vercel + Neon

1. Create a Neon project; copy the **pooled** connection string to `DATABASE_URL` and the
   **unpooled** one to `DIRECT_URL`.
2. Push to GitHub; import the repo into Vercel.
3. Add all environment variables from `.env.example` in the Vercel dashboard.
4. Deploy (`npx vercel --prod --yes` — GitHub auto-deploy is OFF; push alone does not go live).
5. Before deploy, run `npx prisma migrate status` against prod `DATABASE_URL` — confirm "up to date",
   or run `prisma migrate deploy` first.

### Register the Telegram webhook

After your first Vercel deploy, run once (locally, with `.env` pointing at prod values):

```bash
npm run set-webhook
```

Calls `setWebhook` on Telegram pointing to `${APP_URL}/api/telegram` with the correct `secret_token`.

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

## Known Limitations

- **Uzbek STT accuracy is moderate.** Groq Whisper handles Uzbek reasonably but may mis-transcribe
  uncommon words; the confirmation echo lets users catch errors.
- **UZS only.** Foreign-currency amounts (dollars, euros, rubles) trigger a clarification prompt;
  the user must convert manually. Multi-currency display is on the Phase 2 roadmap.
- **Single-user workspace.** Each Telegram user has their own isolated data. Team/multi-user
  workspaces are not yet implemented.
- **Cash basis only.** No accounts, no transfers, no debt/receivables ledger — those are the first
  items on the 3-day roadmap.
- **500-row view cap.** Transactions page shows the most-recent 500 records; server-side search and
  pagination are roadmap items.
