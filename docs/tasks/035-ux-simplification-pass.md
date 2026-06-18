# Task 035 — UX simplification pass (after real-screen review)

**Status:** SPEC · 2026-06-18 · Opus
**Owner agent:** Sonnet (`claude-sonnet-4-6`)

## 1. Why

Opus ran the new screens (tasks 030/032/033/034) on a real mobile viewport with seeded data and found
the "understand-at-a-glance" rule was violated in several places. The features work; they're just too
busy. This task is the SUBTRACTION pass. User decisions captured below.

## 2. The fixes

### Fix A — Home balance: one primary number, debt shown as separate (page.tsx)

Today the hero card shows TWO equal-weight big numbers ("Umumiy balans" + "Naqd qolgan"). A
non-accountant can't tell which is "their money". User decision: **make "Naqd qolgan" (cash on hand)
the PRIMARY number, but still make clear that debts are tracked separately.**

New behavior in `src/app/page.tsx` hero card:
- **When the user has NO open debts** (`hasOpenDebts === false`): show exactly ONE number labeled
  `home.total_balance` ("Umumiy balans") — identical to today. (Cash == balance when no debts.)
- **When the user HAS open debts** (`hasOpenDebts === true`):
  - PRIMARY (big number, same size as today's balance): the **cash-in-hand** value, labeled
    `home.cash_in_hand` ("Naqd qolgan"). Keep its USD secondary line.
  - REMOVE the separate "Naqd qolgan" sub-block that currently sits below.
  - REMOVE the now-redundant "Umumiy balans" big number.
  - Below the primary, add ONE small muted line that makes debts explicit, e.g.:
    `home.debt_aside` → uz: `"Bundan tashqari {amount} qarzga berilgan — qaytishi kutiladi"` when
    givenOpen > takenOpen, or `"{amount} qarz olingan — qaytarish kerak"` when taken dominates.
    Use the NET open-debt position (`givenOpen − takenOpen`); if net is "given" → first string, if
    net is "taken" → second string. Make this line a LINK to `/debts` (so the user can dig in).
    Keep it `text-xs`, muted `rgba(255,255,255,.74)` (on the green card).
  - Keep the existing "Bu oy: +X −Y" context line below that.

The net effect: ONE big number (the cash they actually have), one small explanatory debt line, no
two-equal-numbers confusion.

### Fix B — USD secondary: keep on the main balance, drop from the 3 KPI cells (page.tsx)

User: USD matters for an Uzbek entrepreneur — KEEP it, but it's noise on all 5 spots. Decision:
- KEEP the USD secondary line under the PRIMARY hero balance number (the one big number from Fix A).
- REMOVE the `secondary` USD line from the 3 KPI cells (Income / Expense / Net) — delete the
  `incomeSecondary` / `expenseSecondary` / `netSecondary` rendering in the KPI grid (around
  page.tsx:539). The KPI cells show so'm only.

### Fix C — Recurring amount format (RecurringClient.tsx)

`src/app/(dashboard)/recurring/RecurringClient.tsx:44-47` has its OWN `formatAmount` using
`Intl.NumberFormat`, which renders `2,000,000 so'm` (commas) — inconsistent with the rest of the app
which uses space separators (`2 000 000 so'm`). Replace it: import and use the shared formatter from
`src/lib/currency.ts` (`formatMoney` — confirm its exact signature first; it takes a string amount).
Delete the local `formatAmount`. Every amount on this page must match the app-wide space-grouped style.

### Fix D — Recurring: category required at creation (RecurringClient.tsx + API)

Today a rule can be created with no category → it immediately shows a red "Kategoriya kerak" badge,
which is confusing right after creating it. Make category REQUIRED:
- Client: in the add-rule modal, disable the Save button until a category is selected (same pattern
  as the amount field). Add a category picker if one isn't already present (it should follow the
  type toggle — income categories for income, expense for expense).
- Server: `src/app/api/recurring/route.ts` POST — reject (400) if `categoryId` is missing/empty.
- `src/lib/services/recurring.ts` `createRule` — validate `categoryId` is present and owned by the
  user + matches the rule type.
- Existing rules with null category still render the "Kategoriya kerak" badge (that path stays for
  the category-deleted case D4) — we only prevent CREATING new null-category rules.

### Fix E — Recurring FAB label (RecurringClient.tsx)

The floating "+ Yangi takroriy" button overflows on a 375px mobile width. Shorten the visible label
to `recurring.add_short` → uz `"+ Yangi"`, ru `"+ Новый"`, en `"+ New"`. Keep the full descriptive
text only if it fits; the short form is safe.

### Fix F — Debts row: make the "Asl / To'landi / Qoldi" line readable on mobile (DebtsClient.tsx)

`src/app/(dashboard)/debts/DebtsClient.tsx:856-864` crams Asl·To'landi·Qoldi into one `text-xs` line
that wraps awkwardly on mobile. Improve:
- Render it as its own line with slightly more breathing room: keep `text-xs` but drop the inline
  `·` joins in favor of a compact 3-segment layout where "Qoldi" (remaining) is emphasized (it's the
  number that matters): e.g. `Qoldi: {remaining}` in `var(--fg)` semibold, then `Asl {orig} ·
  To'landi {paid}` smaller in `var(--fg-subtle)` below it. Two short lines beat one cramped wrap.

### Fix G — Debt row amount color consistency (DebtsClient.tsx)

`DebtsClient.tsx:877` colors the given-debt amount green (`var(--income)`). Task 030 already made the
GIVEN summary card neutral because money-lent isn't income — but the individual row still shows green.
For consistency, make the given-debt row amount NEUTRAL (`var(--fg)`); keep the taken-debt amount red
(`var(--expense)`) since "you owe" is a real warning. (Small but it removes the income/expense
mental-model leak the user originally complained about.)

## 3. Verified background (file:line)

- `src/app/page.tsx` — hero card ~337-395 (balance + cash-in-hand sub-block + balanceSecondary);
  KPI grid ~519-548 (incomeSecondary/expenseSecondary/netSecondary).
- `src/app/(dashboard)/recurring/RecurringClient.tsx:44-47` (formatAmount), add-modal ~360-400 (form),
  FAB button (search for `recurring.add`).
- `src/app/api/recurring/route.ts` — POST handler.
- `src/lib/services/recurring.ts` — `createRule`.
- `src/app/(dashboard)/debts/DebtsClient.tsx:856-879` (partial-payment line + amount color).
- `src/lib/currency.ts` — `formatMoney` (the shared formatter).
- `src/lib/i18n/dictionaries.ts` — add: `home.debt_aside` (2 variants or 1 param string),
  `recurring.add_short`.

## 4. Files to touch

- `src/app/page.tsx`
- `src/app/(dashboard)/recurring/RecurringClient.tsx`
- `src/app/api/recurring/route.ts`
- `src/lib/services/recurring.ts`
- `src/app/(dashboard)/debts/DebtsClient.tsx`
- `src/lib/i18n/dictionaries.ts`

## 5. Files NOT to touch

- The bot, STT, brain — out of scope.
- The cron worker / generator logic — unchanged.
- DB schema — NO changes (all fixes are display + validation).
- Other dashboard pages.

## 6. Acceptance criteria

A. `npm run typecheck` + `npm test` (124/124) + `npm run build` all green.
B. Home with no debts: ONE balance number (unchanged from today).
C. Home with open debts: ONE primary "Naqd qolgan" number + one small debt-aside link line; NO second
   big "Umumiy balans" number.
D. KPI cells (Income/Expense/Net) show so'm only — no USD line. Main balance keeps its USD line.
E. Recurring amounts render with SPACE grouping (`2 000 000 so'm`), never commas.
F. Creating a recurring rule REQUIRES a category (Save disabled until picked; server rejects null).
G. Recurring FAB label fits on 375px width.
H. Debts partial-payment info is readable on mobile (remaining emphasized, no cramped single wrap).
I. Given-debt row amount is neutral-colored, not green.

## 7. Gate commands

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
npm run typecheck
npm test
npm run build
```

## 8. Final report shape

```
## Files changed
- ...
## Gate results
- typecheck / test / build
## Deviations from spec
- ...
## Tempted-but-skipped
- ...
```

## 9. Out of scope (DO NOT do)

- DO NOT touch git, deploys — Opus handles + verifies on a real screen this time.
- DO NOT change DB schema or the cron generator.
- DO NOT add new features — this is a subtraction/polish pass only.
- DO NOT touch the bot or STT.
