# Task 032 — Cash-in-hand: balance that reflects open debts

**Status:** SPEC · 2026-06-18 · Opus (autopilot)
**Owner agent:** Sonnet (`claude-sonnet-4-6`)

## 1. Goal

The Home "Umumiy balans" today equals `income − expense` across all time. That's actually NET WORTH
— it doesn't account for cash that walked out the door when the user lent money, nor cash that came
in (but isn't theirs) when they borrowed. So `+5M balans` ≠ `+5M to spend tomorrow`.

Add a **second line under the big balance: "Naqd qolgan"** = `balance − givenOpen + takenOpen`. The
SMB owner now sees, at a glance, BOTH their long-term position (top number) AND their actual liquid
cash (the new line). Show the new line ONLY when at least one open debt exists — otherwise both
numbers are identical and the second line would be noise.

## 2. Why

Audit finding #1 (`docs/STATE.md` audit summary, 2026-06-18). The Lovable critique never caught this
because lovable looked at visuals; the audit agent caught it by reading the formula in
`src/app/page.tsx:189`. Lending 3M makes cash drop by 3M IN REALITY, but PulTrack's balance stays put
— because debt is correctly NOT categorized as expense (semantic = correct), but the cash-flow side
of debt wasn't reflected anywhere. Showing "Naqd qolgan" closes the loop without polluting income/
expense semantics.

The math:
- `cashInHand = income − expense − givenOpen + takenOpen`
- Equivalently: `cashInHand = currentBalance − givenOpen + takenOpen`
- Net worth (unchanged) = `currentBalance` (since receivables and payables cancel out: `+given − taken + cashInHand = income − expense`).

## 3. Verified background (file:line)

- `src/app/page.tsx:178-189` — `allTimeIncomeUzs`, `allTimeExpenseUzs`, `allTimeBalanceUzs` calculation.
- `src/app/page.tsx:337-359` — the hero balance card with "Umumiy balans" + the existing
  `balanceSecondary` line (USD conversion, task 030).
- `src/lib/services/debts.ts:99-119` — `getDebtTotals(userId)` returns `{ givenOpen, takenOpen }` in
  BigInt UZS, already filtering for `status: open` and `deletedAt: null`. Reuse this — do NOT roll a
  new query.
- `src/lib/i18n/dictionaries.ts` — exists `t("home.total_balance", lang)` for the current label. Add
  a sibling `home.cash_in_hand` key for uz/ru/en.
- `src/lib/currency.ts` — `formatMoney` already used in page.tsx for the balance display.

## 4. Files to touch

1. **`src/app/page.tsx`**:
   - Import `getDebtTotals` from `@/lib/services/debts` (top of file with other service imports).
   - Right after `const allTimeBalanceUzs = allTimeIncomeUzs - allTimeExpenseUzs;` (line ~189), call
     `const { givenOpen, takenOpen } = await getDebtTotals(user.id);`
   - Compute `const cashInHandUzs = allTimeBalanceUzs - givenOpen + takenOpen;`
   - Compute `const hasOpenDebts = givenOpen > 0n || takenOpen > 0n;`
   - Format `cashInHandUzs` for the main currency the same way `allTimeBalanceMain` is formatted
     (positive/negative sign + `formatMoneyFn`). Add a `cashInHandSecondary` USD conversion via the
     existing `makeSecondaryLine(...)` helper from task 030 (just call `makeSecondaryLine(absVal)`).
   - In the hero card JSX (around line 359), after the `balanceSecondary` line, conditionally render
     when `hasOpenDebts`:
     ```jsx
     {hasOpenDebts && (
       <div className="mt-2 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,.18)" }}>
         <p className="text-xs font-semibold uppercase tracking-wide pl-0.5" style={{ color: "rgba(255,255,255,.80)" }}>
           {t("home.cash_in_hand", lang)}
         </p>
         <p className="text-base sm:text-lg font-bold tabular tracking-normal break-words" style={{ color: "#ffffff" }}>
           {cashInHandPositive ? "+" : "−"}
           {cashInHandMain}
         </p>
         {cashInHandSecondary && (
           <p className="text-xs mt-0.5 pl-0.5" style={{ color: "rgba(255,255,255,.65)" }}>
             {cashInHandSecondary}
           </p>
         )}
       </div>
     )}
     ```
   - Place this BEFORE the "Bu oy" context block — the cash-in-hand line is more important than
     this-month context.

2. **`src/lib/i18n/dictionaries.ts`** — add `home.cash_in_hand` to all 3 language blocks:
   - uz: `"Naqd qolgan"`
   - ru: `"Свободные деньги"`
   - en: `"Cash on hand"`
   - Also add `home.cash_in_hand.hint` (lighter, only used on hover / aria-label — for now skip if it
     adds complexity; the label alone is clear with the visible context).

## 5. Files NOT to touch

- The debt summary cards (task 030 already fixed those).
- The "Bu oy" KPI grid — its math is independent.
- Per-currency breakdown rows below — unchanged.
- The bot / STT / brain — out of scope.
- Tests, git, deploys.

## 6. Acceptance criteria

A. `npm run typecheck` → 0 errors.
B. `npm test` → 124/124.
C. `npm run build` → green.
D. When a user has open debts: hero card shows "Umumiy balans" + a SECOND smaller block below labeled
   "Naqd qolgan" with the cash-in-hand number, separated by a subtle border-top.
E. When a user has NO open debts: card looks exactly as before (no second block — no noise).
F. Math: a user with income 10M, expense 5M, given 3M, taken 1M sees `+5,000,000 so'm` for balance
   AND `+3,000,000 so'm` for cash-in-hand.
G. Sign handles negative correctly: a user with cash-in-hand `−500k` shows `−500 000 so'm`.

## 7. Gate commands (PowerShell)

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
- typecheck: <pass>
- test: <N / 124>
- build: <pass>

## Deviations from spec
- ...

## Tempted-but-skipped (refactor hygiene)
- ...
```

## 9. Out of scope (DO NOT do)

- DO NOT roll a new debt query — `getDebtTotals` already does it.
- DO NOT change the meaning of "Umumiy balans" — that stays as `income − expense` (net worth).
- DO NOT touch git, commits, deploys.
- DO NOT add bot-side display of cash-in-hand — separate later task.
- DO NOT change any DB schema, Prisma model, or migration.
- DO NOT redesign the hero card's visual style — only add a new sub-block.
