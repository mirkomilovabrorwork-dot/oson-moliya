# Task 014 — Wire the proactive budget alert into the bot (the promised +1 feature)

## Goal
Implement the **proactive (inline-on-expense-write) budget alert** the product already promises
in `README.md` and `docs/product-brief.md` but does NOT implement. When a user logs an **expense**
(via the bot) that brings a budgeted category's **current Tashkent-month** spend to/over its limit,
the bot appends a **localized (uz/ru/en) overspend warning to the same confirmation reply** —
**once per category per month** (guarded by `Budget.lastAlertedYm`).

Design is already locked (from the approved plan): "budget alerts fire inline on expense write,
**no cron**." This task only wires existing pieces together.

## Verified background (file:line — read before coding)
- **Expense-write path:** `src/lib/telegram/bot.ts:172-180` creates the transaction
  (`createTransaction`); `bot.ts:195-206` builds `formatConfirmation(...)` and sends `ctx.reply`.
  The alert must hook **between** the create (180) and the reply (204), and append its text to the
  confirmation so it goes out in the **same message**. `lang` is in scope (used at `bot.ts:200`).
  Only run for `txType === "expense"` **and** a non-null `categoryId`.
- **Schema field already exists (additive, NO migration):** `Budget.lastAlertedYm String?`
  at `prisma/schema.prisma:77`. Currently dead/unused. `Budget` unique key = `@@unique([userId, categoryId])`.
- **Current-Tashkent-month spend per category — copy this exact window:**
  `src/app/api/budgets/route.ts:19-56` (`now = new Date(Date.now() + 5h)`; `monthStart`/`monthEnd`
  via `Date.UTC(year, month-1, 1) - 5h`; `prisma.transaction.groupBy` by categoryId, `_sum.amountUzs`,
  filtered `deletedAt: null`, `type: TxType.expense`, `occurredAt: { gte: monthStart, lt: monthEnd }`).
- **Pure decision logic already written + tested, but against a LOCAL COPY:**
  `tests/budget.test.ts:27-40` defines `checkBreach(spent, {limitUzs, lastAlertedYm}, currentYm)` and
  its comment (line 13-15) says "In real impl this lives in `src/lib/services/budgets.ts`" — **that file
  does not exist.** We create it and re-point the test at the real export.
- **Localization + amount formatting:** `src/lib/telegram/reply.ts:5-14` `formatAmount(bigint)`
  (space-grouped + " so'm"); `reply.ts:48-91` `formatConfirmation` shows the uz/ru/en inline-switch pattern.

## Files to CREATE
### `src/lib/services/budgets.ts`
Export exactly:
- `checkBreach(spentThisMonth: bigint, budget: { limitUzs: bigint; lastAlertedYm: string | null }, currentYm: string): { shouldAlert: boolean; newLastAlertedYm: string | null }`
  — **identical logic to the current test** (`tests/budget.test.ts:27-40`): if `spent < limit` → no alert
  (keep existing `newLastAlertedYm`); else if `lastAlertedYm === currentYm` → no alert; else
  `{ shouldAlert: true, newLastAlertedYm: currentYm }`. (Threshold is `>=` limit.)
- `tashkentYm(d?: Date): string` → current Tashkent `"YYYY-MM"` (use the `+5h` shift pattern; pad month to 2 digits).
- `async function checkExpenseBudgetBreach(userId: string, categoryId: string): Promise<{ categoryName: string; spentUzs: bigint; limitUzs: bigint } | null>`:
  1. Load `budget` by unique `{ userId, categoryId }` **including** `category`. If none → `return null`.
     If `limitUzs <= 0n` → `return null`.
  2. Compute the current Tashkent-month window (copy from `budgets/route.ts:19-27`).
  3. `groupBy`/`_sum` the expense spend for that category in the window (`deletedAt: null`,
     `type: TxType.expense`, `categoryId`, `occurredAt` in window). `spent = sum ?? 0n`.
  4. `currentYm = tashkentYm()`. `res = checkBreach(spent, { limitUzs, lastAlertedYm }, currentYm)`.
  5. If `!res.shouldAlert` → `return null`.
  6. Persist the guard: update the budget's `lastAlertedYm = currentYm` (use
     `prisma.budget.updateMany({ where: { userId, categoryId, NOT: { lastAlertedYm: currentYm } }, data: { lastAlertedYm: currentYm } })` to be race-safe).
  7. `return { categoryName: budget.category.name, spentUzs: spent, limitUzs }`.

## Files to EDIT
### `src/lib/telegram/reply.ts`
Add `export function formatBudgetAlert(params: { categoryName: string; spentUzs: bigint; limitUzs: bigint; language: string }): string`
returning a localized warning using `formatAmount`. Suggested copy (keep tone friendly, not alarming):
- uz: `⚠️ Eslatma: "{cat}" bo'yicha bu oy {spent} sarfladingiz — {limit} limitidan oshdi.`
- ru: `⚠️ Внимание: по категории "{cat}" в этом месяце потрачено {spent} — превышен лимит {limit}.`
- en: `⚠️ Heads up: you've spent {spent} on "{cat}" this month — over your {limit} limit.`

### `src/lib/telegram/bot.ts`
After `createTransaction` (line 180), when `txType === "expense" && categoryId`, call
`checkExpenseBudgetBreach(user.id, categoryId)` inside a **try/catch** (a failed budget check must
NEVER break logging or the confirmation). If it returns data, build the warning via
`formatBudgetAlert({ ..., language: lang })` and **append** it to the confirmation text (a blank line
then the warning) so the existing single `ctx.reply` (line 204) sends one combined message. Add the
two imports.

## Files NOT to touch
`prisma/schema.prisma` (field already present — additive, no migration), the web dashboard,
`src/app/api/budgets/route.ts`, `src/lib/parser`/auth, `.env`, any STATE/git.

## Tests (required)
- Rewrite `tests/budget.test.ts` to **import `checkBreach` from `@/lib/services/budgets`** (delete the
  in-file copy) so the test guards the **shipped** function. Keep ALL existing cases — they must still
  pass: under limit→no alert; exactly at limit→alert (+ym set); over→alert (+ym set); second same
  month→no alert; new month→alert; new month under→no alert.
- If a DB-backed test of `checkExpenseBudgetBreach` is quick and the test DB is reachable, add one using
  **per-run unique IDs (pid + timestamp)** per `docs/CONVENTIONS.md`, and make it pass twice. If DB
  setup is heavy/unavailable in CI, the re-pointed pure-logic test is the required minimum — note the decision.

## Acceptance criteria
1. A bot expense that brings a budgeted category's **current-month** spend `>=` its limit appends a
   localized (uz/ru/en) overspend warning to the **same** confirmation reply.
2. A second qualifying expense in the **same** Tashkent month → **no** second warning; a new month re-arms it.
3. No budget / no category / limit not crossed → no warning; behavior identical to today.
4. A failure inside the budget check never blocks logging or the confirmation (try/catch).
5. `tests/budget.test.ts` imports the real `checkBreach` and passes.
6. Warning amounts use the existing `formatAmount` (space-grouped + " so'm").

## Gate commands (must be green before "done")
PowerShell: `$env:Path = "C:\Program Files\nodejs;" + $env:Path` then
`npm run typecheck` ; `npm test` ; `npm run build`.

## Hard constraints (CONVENTIONS)
UTF-8 via Edit/Write only. Additive only. Do NOT commit or touch git. Do NOT edit `docs/STATE.md` or
`.env`. Final report: files changed, gate results (paste the pass/fail lines), and any deviations.
