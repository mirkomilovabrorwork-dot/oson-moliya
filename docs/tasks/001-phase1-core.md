# TASK 001 — Phase 1: Working core (MVP)

**Goal:** A working end-to-end slice: Telegram bot logs income/expense from TEXT (with a
clarification loop), confirms in the user's language; a magic-link from the bot logs the user
into a dashboard showing Overview + a Transactions list of their data. Voice, finance queries,
correction/deletion, analytics, budgets come in later phases — but the DB schema and the brain's
intent enum already include them so nothing needs reshaping later.

## Working directory & env quirks
- Repo root: `C:\Users\localhost\Desktop\pultrack`.
- Run ALL node/npm/npx/prisma via the **PowerShell tool** with this prefix first:
  `$env:Path = "C:\Program Files\nodejs;" + $env:Path`. Do NOT use the Bash tool for node tooling.
- Next.js is v16 — it differs from training data. BEFORE writing App Router code, skim
  `node_modules/next/dist/docs/01-app/` for: async `cookies()`/`headers()`, async route `params`,
  Route Handler signatures, and `middleware.ts` conventions. Match what the installed version expects.
- There is NO live database yet. Do `prisma generate` and `prisma validate` (these need no DB).
  Do NOT run `prisma migrate` (no DATABASE_URL yet — the user will provide Neon later).
- `npm run build` MUST pass WITHOUT a live DB: mark every dashboard page that reads data with
  `export const dynamic = 'force-dynamic'`, and make env validation lazy (see env.ts) so importing
  modules never throws at build time.

## Conventions (hard constraints)
- Write/edit files with the Write/Edit tools only (UTF-8). 
- Do NOT touch git, do NOT commit, do NOT run deploy, do NOT write real secrets anywhere. `.env.local`
  may be created with PLACEHOLDER values only (real keys are added by the main session later).
- Money: `amountUzs` is `BigInt` whole so'm. Provide a `serializeBigInt` helper and convert to string
  in EVERY API JSON response; parse back to number/string on the client.
- Dates: compute "today / this month" in Asia/Tashkent (UTC+5, no DST). Store `occurredAt` in UTC.
- Keep the prompt↔parser contract thin: Claude returns a forced tool call; validate it with zod
  server-side; on validation failure, ask the user to rephrase — never crash.

## package.json scripts to add
```
"typecheck": "tsc --noEmit",
"test": "vitest run",
"db:generate": "prisma generate",
"db:migrate": "prisma migrate dev",
"set-webhook": "tsx scripts/set-webhook.ts"
```
Add a minimal `vitest.config.ts` (node environment).

## Prisma schema — `prisma/schema.prisma`
Postgres. Generator `prisma-client-js` (driverAdapters is GA in Prisma 6 — no previewFeatures needed).
`datasource db { provider="postgresql"; url=env("DATABASE_URL"); directUrl=env("DIRECT_URL") }`.
Models (create exactly these; indexes matter):
- `enum TxType { income expense }`
- `User`: id cuid PK; `telegramId BigInt @unique`; firstName String?; username String?;
  `language String @default("uz")`; createdAt; relations: transactions, categories, budgets,
  pendingAction (1:1), magicTokens, sessions.
- `Category`: id; userId (FK, onDelete Cascade); `name String` (canonical lowercased); `type TxType`;
  emoji String?; `isDefault Boolean @default(false)`; `@@unique([userId,name,type])`; `@@index([userId,type])`.
- `Transaction`: id; userId (FK Cascade); categoryId String? (FK Category, onDelete SetNull);
  `type TxType`; `amountUzs BigInt`; note String?; `occurredAt DateTime`; `source String @default("bot")`;
  `deletedAt DateTime?`; createdAt; `@@index([userId,occurredAt])`, `@@index([userId,type,occurredAt])`,
  `@@index([userId,categoryId,occurredAt])`.
- `Budget`: id; userId (FK Cascade); categoryId (FK Cascade); `limitUzs BigInt`; `lastAlertedYm String?`;
  `@@unique([userId,categoryId])`.
- `PendingAction`: id; `userId String @unique` (FK Cascade); intent String; `draft Json`; question String;
  lastTransactionId String?; expiresAt DateTime; updatedAt @updatedAt.
- `MagicToken`: id; userId (FK Cascade); `tokenHash String @unique`; expiresAt; usedAt DateTime?.
- `Session`: id; userId (FK Cascade); `tokenHash String @unique`; expiresAt; `@@index([userId])`.

## env — `src/lib/env.ts`
Zod schema for the vars in `.env.example`. Export a `getEnv()` that lazily parses `process.env` on
first call and caches it (do NOT parse at module top-level — that would break `next build`). Provide
typed getters. CLAUDE_MODEL default `claude-haiku-4-5-20251001`. STT_PROVIDER default `groq`.

## db — `src/lib/db.ts`
Prisma client singleton (global cache to survive serverless/HMR), using `@prisma/adapter-neon` over the
POOLED `DATABASE_URL`. Check the installed adapter's constructor signature in
`node_modules/@prisma/adapter-neon` (v6) and use it correctly. Lazy-init so build doesn't require a URL.

## Claude brain — `src/lib/claude/`
- `client.ts`: Anthropic SDK client from env (`ANTHROPIC_API_KEY`, model `CLAUDE_MODEL`).
- `tools.ts`: ONE tool `record_intent` with `input_schema` containing fields:
  `intent` enum [log_income, log_expense, finance_query, correct_transaction, delete_transaction,
  add_category, clarify_needed, unknown]; `language` enum [uz,ru,en]; `confidence` number;
  `amount` integer|null (whole so'm, expanded); `type` enum[income,expense]|null; `category` string|null;
  `date` string|null (today|yesterday|YYYY-MM-DD); `note` string|null;
  `query` object|null (metric[sum,count,avg,net,breakdown], type, category, period[today,yesterday,
  this_week,this_month,last_month,this_year,custom], dateFrom, dateTo, groupBy[category,day,month,null]);
  `target` enum[last,by_amount]|null; `patch` object|null (amount,category,type,note);
  `missing_fields` string[]; `reply_text` string (localized). Required: intent, language, confidence, reply_text.
  Export a matching **zod** schema for server-side validation.
- `prompts.ts`: system prompt — role = finance-message parser for an Uzbekistan SMB. Inject today's date
  (Asia/Tashkent) and the user's known category names. Rules: detect language (uz/ru/en) and reply in it;
  expand uz/ru amount shorthands BEFORE emitting `amount` (ming/минг ×1e3, mln/million/млн ×1e6, mlrd ×1e9,
  k ×1e3, "yarim"=0.5); never invent amounts; never write SQL (fill `query` for questions). For Phase 1
  only log_income/log_expense/clarify_needed/unknown are acted on; the rest may be returned but the bot
  replies "coming soon" for them (wire fully in later phases).
- `amount.ts`: deterministic parser `parseAmountUzs(text): bigint | null` for uz/ru/en number words +
  multipliers ("500 000", "500ming", "500 ming", "2 mln", "2,5 mln", "yarim million", "1.5 million").
  Used as a fallback when the model returns null `amount`, and as the unit-tested source of truth.
- `brain.ts`: `runBrain({ text, user, pending })` → calls Claude with `tool_choice` forcing `record_intent`,
  parses + zod-validates the tool input, applies amount fallback. Returns the structured result.

## Telegram — `src/lib/telegram/` + route
- `bot.ts`: grammY `Bot` from `TELEGRAM_BOT_TOKEN`. Handlers:
  - `/start`: greet (uz default) + show an inline "📊 Dashboard" button (URL set later by reply helper).
  - text message: load/create `User` by `telegramId`; load non-expired `PendingAction`; `runBrain`;
    if `intent` is log_* and a required field (amount/type) is missing → upsert PendingAction (+15min) and
    send the clarifying `reply_text`; if a pending action exists, merge the new answer and complete;
    on complete → resolve/auto-create Category (lowercased), insert Transaction, clear PendingAction,
    send a deterministic localized confirmation ("Yozildi: 500 000 so'm chiqim, logistika, bugun.")
    PLUS the "📊 Dashboard" button (magic-link, see auth).
  - finance_query / correct / delete / add_category: reply "coming soon" placeholder (Phase 2).
  - voice: reply "voice coming soon" (Phase 2).
- `reply.ts`: helpers to build the inline Dashboard button (issues a MagicToken for that user and builds
  `${APP_URL}/api/auth/verify?token=<raw>`), and to format the localized confirmation string.
- `src/app/api/telegram/route.ts`: `POST` handler. Verify `X-Telegram-Bot-Api-Secret-Token` ===
  `TELEGRAM_WEBHOOK_SECRET` (401 if mismatch). Hand the update to grammY `webhookCallback(bot, "std/http")`.
  Catch all errors, log, and STILL return 200. Add `export const dynamic='force-dynamic'` and
  `export const maxDuration = 30`.
- `scripts/set-webhook.ts`: tsx script that calls Telegram `setWebhook` with `${APP_URL}/api/telegram`
  and `secret_token=TELEGRAM_WEBHOOK_SECRET`. (Run manually later; just create it.)

## Services — `src/lib/services/`
- `categories.ts`: `DEFAULT_CATEGORIES` (income: Sotuv/Sales, Boshqa kirim; expense: Logistika, Oylik/Maosh,
  Ijara, Mahsulot/Tovar, Kommunal, Reklama, Boshqa chiqim) with emoji; `ensureDefaultCategories(userId)`;
  `resolveOrCreateCategory(userId, name, type)`.
- `transactions.ts`: `createTransaction`, `listTransactions(userId, {limit,offset,filters})`,
  `getRecentTransaction(userId)`, `getOverview(userId, period)` (sum income, sum expense, net, and prior
  period comparison — Asia/Tashkent month boundaries).
- `pending.ts`: get/upsert/clear PendingAction (with expiry check).

## Auth (magic-link) — `src/lib/auth/` + routes + middleware
- `token.ts`: `issueMagicToken(userId)` → raw = random 32-byte hex, store sha256 hash, expiresAt +10min,
  return raw. `consumeMagicToken(raw)` → find unused/unexpired by hash, mark usedAt, return userId|null.
- `session.ts`: `createSession(userId)` → raw cookie token, store hash, +30d; `getSessionUser()` (reads
  `pultrack_session` cookie via async `cookies()`, returns user|null); `destroySession()`.
- `src/app/api/auth/verify/route.ts`: GET `?token=` → consume magic token → create session → set cookie
  `pultrack_session` (HttpOnly, Secure, SameSite=Lax, Path=/) → 302 redirect to `/` (or `/onboarding` if
  the user has zero transactions).
- `src/app/api/auth/logout/route.ts`: clear session, redirect to a simple "open from your bot" page.
- `src/middleware.ts`: protect `/(dashboard)` routes and mutating `/api/(transactions|categories|budgets)`;
  exclude `/api/telegram` and `/api/auth/*`. Unauthenticated dashboard → redirect to `/login` info page;
  unauthenticated API → 401.

## API routes (Phase 1 subset)
- `src/app/api/transactions/route.ts`: `GET` (list, serialized) + `POST` (quick-add from dashboard:
  {type, amountUzs, categoryId|categoryName, note, occurredAt}). 
- `src/app/api/transactions/[id]/route.ts`: `PATCH` (edit) + `DELETE` (soft delete). (Used by dashboard;
  inline UI can be minimal in Phase 1.)
All responses serialize BigInt to string. All require a valid session (via getSessionUser).

## Dashboard — `src/app/(dashboard)/`
- `layout.tsx`: top nav (Overview / Transactions / Analytics / Categories — last two can be placeholder
  links for now) + a `<LangSwitcher/>` + logout. Guard: if no session → redirect to /login info page.
- `page.tsx` (Overview): StatCards (income, expense, net) with this-month-vs-last-month comparison;
  a QuickAddForm (client component → POST /api/transactions). `export const dynamic='force-dynamic'`.
- `transactions/page.tsx`: table of the user's transactions (date, type, category, amount, note),
  newest first. `force-dynamic`.
- `/login` page (`src/app/login/page.tsx`): simple "Open PulTrack from your Telegram bot" info screen.

## i18n — `src/lib/i18n/`
- `dictionaries.ts`: `{ uz: {...}, ru: {...}, en: {...} }` key→string. Fill UZ fully for all Phase 1 UI
  strings; RU and EN may mirror UZ keys (can be refined in Phase 3) but must exist so `t()` never misses.
- `index.ts`: `t(key, lang)` + cookie `pultrack_lang` resolution (cookie → User.language → "uz").
- `components/LangSwitcher.tsx`: UZ/RU/EN toggle that sets the cookie and refreshes.

## Acceptance criteria
1. `npm run db:generate` succeeds; `npx prisma validate` passes; schema matches the spec (tables, indexes, enums).
2. `npm run typecheck` clean. `npm run build` succeeds WITHOUT a live DATABASE_URL.
3. `npm test` green — includes `tests/amount.test.ts` covering: "500 ming"→500000n, "2 mln"→2000000n,
   "2,5 mln"→2500000n, "500 000"→500000n, "yarim million"→500000n, "1.5 million"→1500000n, ru/en variants.
4. Code is structured exactly per the file list; BigInt serialized in all API responses; webhook verifies
   the secret token and returns 200 on error; dashboard pages are `force-dynamic`; env is lazy.
5. No git operations, no real secrets, no `prisma migrate`, no deploy performed.

## Final report (return to main session)
List: files created/changed; gate results (typecheck/test/build outputs); any Next-16 or Prisma-6 API
deviations you discovered and how you handled them; anything you stubbed for later phases; open questions.
