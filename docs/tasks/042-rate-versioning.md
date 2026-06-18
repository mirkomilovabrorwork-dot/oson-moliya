# Task 042 — Currency rate versioning (forward-only) + show rate on foreign tx

**Status:** SPEC · 2026-06-18 · Opus
**Owner agent:** Sonnet (`claude-sonnet-4-6`)

## 1. Goal

Audit #4: foreign-currency transactions store only the converted `amountUzs` + the original
amount/currency — NOT the rate used at entry time. So there's no record of "100 USD was logged at
12,800 so'm". User chose **forward-only** (no backfill of historical rows). Two parts:

- **A. Stamp the entry-time rate** on every NEW foreign-currency transaction (additive DB field).
- **B. Show it** on the transaction row/detail: e.g. "$100 · kurs 12 800 · 1 280 000 so'm" so the
  user can see exactly what rate applied that day (transparency + an audit trail).

**Do NOT touch the Home overview's live-reconvert behavior** — that "show foreign tx at the CURRENT
CBU rate" is an INTENTIONAL design the user picked in commit 5633526 (Revolut-style current value).
This task only ADDS a stored rate + shows it on the transaction itself; it does not change how Home
aggregates. (Honest note: this is transparency + future-proofing, not a full reversal of audit #4 —
flipping Home to entry-time rates would contradict the user's chosen design, so it's out of scope.)

## 2. Verified background (file:line)

- `src/lib/rates.ts:14-17` — `interface Rates { USD: number; EUR: number; RUB: number }` (so'm per 1
  foreign unit, e.g. USD: 12800). `getRates()` (line 47) returns live CBU rates with fallback.
- `src/app/api/transactions/route.ts:195-206` — the multi-currency path: `rates = await getRates()`,
  `convertToUzs(...)`, sets `resolvedOriginalCurrency` + `resolvedOriginalAmount`. The rate used is
  `rates[data.currency]` — capture THAT.
- `src/lib/services/transactions.ts` — `createTransaction(...)` input shape (add the rate field).
- `prisma/schema.prisma` Transaction model — add the field.
- Transaction display: `src/app/(dashboard)/transactions/TransactionsClient.tsx` — the row render for
  a foreign tx (currently shows the foreign amount like "$100.00"). Also any tx detail/edit view.
- The bot also creates foreign tx (`src/lib/telegram/bot.ts`) — OUT OF SCOPE per "don't touch the
  bot"; the field is nullable so bot-created foreign tx simply have a null rate (acceptable). Do NOT
  edit bot.ts.

## 3. Schema (additive only)

Add to the `Transaction` model:
```prisma
  rateToUzs        Float?    // entry-time so'm per 1 unit of originalCurrency; null for UZS / legacy
```
Nullable, additive — zero impact on existing rows. **Opus runs `prisma db push` after gates pass.**

## 4. Changes

### A. Capture the rate (`src/app/api/transactions/route.ts` + `createTransaction`)
In the multi-currency branch (line ~195-206), after `const rates = await getRates();`, capture
`const usedRate = rates[data.currency];` and pass it through to `createTransaction` as `rateToUzs`.
For UZS / legacy paths, pass `rateToUzs: null`. Update `createTransaction`'s input type + the
`prisma.transaction.create` data to include `rateToUzs`.

### B. Serialize it
Wherever transactions are serialized for the client (the GET list + the POST response — look for
where `originalCurrency`/`originalAmount` are `.toString()`'d / mapped), include `rateToUzs` (a plain
number, no BigInt). Add it to the client-side transaction type.

### C. Show it on the foreign-tx row (`TransactionsClient.tsx`)
For a transaction with `originalCurrency` + `rateToUzs` set, render a small muted secondary line
under the amount: `{originalAmount} {currency} · kurs {rate} · {amountUzs} so'm`. Use the existing
money formatter for the so'm part; show the rate space-grouped (e.g. 12 800). For UZS tx, render
exactly as today (no rate line). New i18n key `tx.rate_label` → uz "kurs", ru "курс", en "rate".
Keep it `text-xs`, muted — one extra small line, only on foreign tx.

## 5. Acceptance criteria

A. `prisma generate` + `npm run typecheck` + `npm test` (124/124) + `npm run build` green.
B. A new USD/EUR/RUB transaction stores `rateToUzs` = the CBU rate used at creation.
C. UZS transactions store `rateToUzs = null` and render unchanged.
D. The transactions list shows, for a foreign tx, a small line with the original amount + rate +
   so'm equivalent.
E. Schema change is additive (nullable); no existing column touched. Home overview unchanged.

## 6. Gate commands
```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
npx prisma generate
npm run typecheck
npm test
npm run build
```

## 7. Final report shape
```
## Files changed / Gate results (incl prisma generate) / Deviations / Tempted-but-skipped
```

## 8. Out of scope
- DO NOT run prisma db push/migrate — Opus applies it.
- DO NOT change the Home overview live-reconvert logic (user's intentional design).
- DO NOT touch the bot (bot-created foreign tx get a null rate — fine).
- DO NOT backfill historical rows (user chose forward-only).
- DO NOT touch git/deploy — Opus verifies on a real preview, applies the migration, then deploys.
