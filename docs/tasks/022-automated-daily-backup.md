# Task 022 — Automated daily backup (Telegram admin channel via Vercel Cron)

## Goal
Every day, dump the whole database (all users' durable financial data) to a single
JSON file and send it to a private, dev-owned Telegram channel, so the project always
has a second independent copy of the data besides Neon. The data stays **PRIMARY in
Neon** (Neon has its own PITR); this Telegram copy is the disaster-recovery 2nd copy.
A user deleting their own Telegram does NOT affect it (the channel is dev-owned).

This feature is **read-only on the DB — it adds NO column and NO migration.**

## Verified background (file:line — confirmed by audit)
- Env config: `src/lib/env.ts` — Zod schema (lines 3–18), lazy `getEnv()` (45–55).
  Vars accessed via `const env = getEnv(); env.X`. Add new vars to the schema object.
- Prisma singleton: `src/lib/db.ts` — `import { db } from "@/lib/db"`, then
  `const prisma = db as import("@prisma/client").PrismaClient;`.
- Models with durable financial data (dump these): `User`, `Account`, `Category`,
  `Budget`, `Transaction` (has `deletedAt`), `Debt` (has `deletedAt`). Money fields
  (`amountUzs`, `limitUzs`, `initialBalanceUzs`, `originalAmount`) are **BigInt** →
  JSON.stringify will throw → MUST use a BigInt-safe replacer.
  DO NOT dump `Session`, `MagicToken`, `PendingAction` (ephemeral auth/security state).
- Existing export pattern to mirror: `src/app/api/export/route.ts` — `getSessionUser()`
  auth, per-user queries, `force-dynamic`. There is a `serializeBigInt` helper used in
  `src/app/api/accounts/route.ts` — reuse it or a `(k,v)=>typeof v==="bigint"?v.toString():v` replacer.
- Telegram send: `getBot()` from `src/lib/telegram/bot.ts` (singleton, safe in routes,
  used by `src/app/api/telegram/route.ts:28`). Send a doc with
  `getBot().api.sendDocument(chatId, new InputFile(buffer, filename), { caption })`.
  `InputFile` is imported from `grammy` (bot.ts line 28; sendDocument site bot.ts:273).
- Route conventions: `export const dynamic = "force-dynamic"`; webhook route sets
  `export const maxDuration = 30` and verifies a secret header with `timingSafeEqual`
  (`src/app/api/telegram/route.ts:7–19`) — copy that secret-compare style.
- Webhook route `/api/telegram` works WITHOUT a user session (it uses a secret). Find
  whatever lets it bypass the session proxy (`src/lib/proxy.ts` / middleware) and make
  `/api/cron/backup` bypass the same way — cron has no session cookie.
- `vercel.json` does NOT exist yet. No cron route exists yet (`src/app/api/cron/` is new).
- Gates: `npm run typecheck` · `npm test` (vitest) · `npm run build`. Node already on
  PATH in the PowerShell tool only.

## Files to TOUCH
1. `src/lib/env.ts` — add TWO **OPTIONAL** vars to the Zod schema:
   - `BACKUP_CHANNEL_ID: z.string().optional()`
   - `CRON_SECRET: z.string().optional()`
   **They MUST be `.optional()`** — `getEnv()` is called by every route; making them
   required would throw app-wide until the user sets them in Vercel. Optional = the app
   keeps working and the backup route degrades gracefully when unconfigured.
2. `src/lib/backup.ts` (NEW) — two functions:
   - `collectBackupData(prisma)`: `findMany()` for User, Account, Category, Budget,
     Transaction, Debt — **include soft-deleted rows** (no `deletedAt` filter; a backup
     must capture everything). Return an object `{ users, accounts, categories, budgets,
     transactions, debts }`.
   - `serializeBackup(data, generatedAtISO)`: PURE function. Returns
     `{ json: string, counts: Record<string, number> }`. `json` = pretty-printed
     `JSON.stringify` with a BigInt-safe replacer, wrapped as
     `{ app: "oson-moliya", version: 1, generatedAt, counts, data }`. `counts` = row
     count per table. Keep it pure (no prisma, no Date.now inside — take the ISO string
     as an arg) so it is unit-testable without a DB.
3. `src/app/api/cron/backup/route.ts` (NEW) — `GET` handler:
   - `export const dynamic = "force-dynamic"; export const runtime = "nodejs"; export const maxDuration = 60;`
   - Read `const env = getEnv();`.
   - **Auth:** if `env.CRON_SECRET` is set, require header
     `Authorization: Bearer <CRON_SECRET>` and compare with `timingSafeEqual`
     (constant-time, like the webhook). Mismatch → `401`. (Vercel Cron auto-sends this
     Bearer header when a `CRON_SECRET` env var exists.)
   - **Graceful skip:** if `!env.BACKUP_CHANNEL_ID` OR `!env.CRON_SECRET` →
     return `Response.json({ ok: true, skipped: "backup not configured" }, { status: 200 })`.
     (So deploying before the user sets env is harmless and the cron just no-ops.)
   - Build the dump: `collectBackupData` → `serializeBackup(data, new Date().toISOString())`.
   - Send: `getBot().api.sendDocument(env.BACKUP_CHANNEL_ID, new InputFile(Buffer.from(json,"utf8"), filename), { caption })`
     where `filename = \`oson-moliya-backup-${YYYY-MM-DD}.json\`` and `caption` lists the
     date + per-table counts (e.g. `📦 Backup 2026-06-16\nusers: 3 · tx: 142 · debts: 5 ...`).
   - Wrap the whole body in try/catch; on error log `console.error` and return
     `{ ok: false, error: "backup_failed" }` with status `500` (so a failure is visible
     in Vercel logs, but never leaks internals).
   - Return `{ ok: true, counts }` 200 on success.
4. `vercel.json` (NEW, repo root):
   ```json
   { "crons": [ { "path": "/api/cron/backup", "schedule": "0 3 * * *" } ] }
   ```
   (03:00 UTC ≈ 08:00 Tashkent; Vercel Hobby = once-daily granularity, this fits.)
5. `src/lib/backup.test.ts` (NEW) — vitest unit tests for `serializeBackup` ONLY (pure,
   no DB):
   - BigInt fields serialize to strings (no throw).
   - Output JSON parses back and contains all 6 table keys under `data`.
   - `counts` matches the input array lengths.
   - `generatedAt` equals the passed ISO string.
6. `.env.example` (if it exists) — document `BACKUP_CHANNEL_ID` and `CRON_SECRET` with a
   one-line comment each. If the file does not exist, skip.
7. `docs/RESTORE.md` (NEW) — short doc:
   - What the backup file is (the JSON structure, which tables).
   - Where it goes (the private Telegram channel).
   - The ONE-TIME user setup: create a private channel → add the bot as an admin → get
     the channel id (e.g. forward a channel message to `@username_to_id_bot`, ids look
     like `-100…`) → set `BACKUP_CHANNEL_ID` and a strong random `CRON_SECRET` in Vercel
     project env → redeploy.
   - How to restore conceptually (read the JSON, re-insert per table respecting FK order:
     User → Account/Category → Budget/Transaction/Debt). A full restore script is out of
     scope for this task — just document the approach.

## Files NOT to touch
- `prisma/schema.prisma` — **NO schema change, NO migration, NO `prisma db push`,
  NEVER `prisma migrate dev`.** This feature is read-only on the DB.
- `src/lib/telegram/bot.ts` logic (only import `getBot`/`InputFile` from it).
- Any existing `src/app/api/**` route other than reading its conventions.
- Git — do NOT commit, push, branch, or touch `.git`. The main session (Opus) commits.

## Acceptance criteria
- `BACKUP_CHANNEL_ID` and `CRON_SECRET` are OPTIONAL env vars; with neither set, the app
  builds and all existing routes still work, and `GET /api/cron/backup` returns 200 with
  `skipped`.
- With both set, an authorized `GET /api/cron/backup` (correct Bearer) collects all 6
  tables (including soft-deleted rows), serializes BigInt-safe JSON, and sends it as a
  document to the channel; wrong/missing Bearer → 401.
- `/api/cron/backup` is reachable WITHOUT a user session (not blocked by the session proxy).
- No DB schema change; no migration files added.
- `serializeBackup` is pure and covered by unit tests.

## Required tests
- `src/lib/backup.test.ts` as described (4 assertions). Must pass under `npm test`.

## Gate commands (run after implementation)
- `npm run typecheck`  (expect 0 errors)
- `npm test`           (existing 112 + new tests pass)
- `npm run build`      (`prisma generate && next build` succeeds, route compiles)

## Final report from the implementer
- List of files changed/created.
- Gate results (paste the tail of each).
- Any deviation from this spec and why.
- Confirm: no schema change, no git/commit, no secrets written to tracked files.
