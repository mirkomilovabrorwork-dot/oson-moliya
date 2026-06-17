# Task 030 — Dashboard real-bug fixes (post-Lovable critique)

**Status:** SPEC · 2026-06-18 · Opus
**Owner agent:** Sonnet (`claude-sonnet-4-6`)

## 1. Goal

Fix the 4 verified-real bugs in the production dashboard that the Lovable critique surfaced. Skip the
~10 false/outdated claims and the 1 stylistic-call (serif-for-headings is intentional design, not a bug).

## 2. The 4 fixes

1. **Invalid Date guard in `formatDate`** (`src/app/(dashboard)/debts/DebtsClient.tsx:40-47`).
   Today: `new Date(iso).toLocaleDateString(...)` — if `iso` is null/undefined/an empty string the
   `Date` object is invalid and `.toLocaleDateString()` returns the literal English string
   `"Invalid Date"`. The user's screenshot showed "Men berdim · Invalid Date" on a debt row with no
   due-date set. Fix:
   ```ts
   function formatDate(iso: string | null | undefined, lang: string): string {
     if (!iso) return lang === "ru" ? "—" : lang === "en" ? "—" : "—";
     const d = new Date(iso);
     if (isNaN(d.getTime())) return lang === "ru" ? "—" : lang === "en" ? "—" : "—";
     return d.toLocaleDateString(...);
   }
   ```
   Use an em-dash (`—`) — it reads as "no value" in all 3 langs without taking up much room. Trace
   every call site to `formatDate(...)` in DebtsClient.tsx and adjust the call signature (now takes
   `lang`). If any caller passes a possibly-missing field (e.g. `debt.dueAt ?? undefined`), keep that
   nullable path — DO NOT widen field types in Prisma or component props beyond what is necessary.

2. **"Berilgan qarz" summary card — drop the green semantic color** (`src/app/(dashboard)/debts/DebtsClient.tsx:525-535`).
   Today the "given" card uses `background: var(--income-wash)` + `color: var(--income)` — i.e. the
   same green as INCOME. "Berilgan qarz" is an asset-at-risk (money lent to someone), not realized
   income. Misreading it as income is the actual Lovable complaint.
   Fix: switch the given card to NEUTRAL styling:
   ```ts
   style={{
     background: "var(--surface)",                       // was: var(--income-wash)
     border: "1px solid var(--border)",
     boxShadow: "var(--shadow-sm)",
   }}
   // label color:
   style={{ color: "var(--fg-subtle)" }}                  // was: var(--income)
   // number color:
   style={{ color: "var(--fg)" }}                         // was: var(--income)
   ```
   The "olingan qarz" (taken/borrowed) card KEEPS its current `--expense-wash` + `--expense`
   coloring — "you owe X" really IS a warning state, and red is correct. Only the given card changes.

3. **USD secondary line on big numbers** (`src/app/(dashboard)/page.tsx`, the Home balance + KPI strip).
   Today: only UZS shown on the Home top balance + the "this month" KPI numbers, even though the user
   has selected a `mainCurrency` and CBU live rates exist (multi-currency redesign `5633526`).
   Fix: under the **big balance number** (and under each of the 3 KPI numbers — Income / Expense / Net),
   render a small secondary line in the OTHER currency, converted at the live CBU rate.
   - If `user.mainCurrency === "UZS"`: secondary line shows the USD equivalent (`≈ $X,XXX`).
   - If `user.mainCurrency === "USD"` (or RUB/EUR): secondary line shows the UZS equivalent.
   - Style: small (`text-xs`), muted (`color: var(--fg-subtle)`), one line per big number — do NOT
     add it to every row in the transaction/category lists (would be noise).
   - Use the EXISTING `rates` object passed into the page (same one the multi-currency overview uses).
     Locate the rate fetch in page.tsx; if a helper already does UZS↔USD conversion, reuse it. If
     `mainCurrency` is unknown or rate is missing, omit the secondary line silently (no broken layout).
   - **Only render the secondary line if the converted value is materially different from 0**
     (e.g. balance is 0 → no "≈ $0" noise).

4. **FAB safe spacing — last row not hidden under the +button** (`src/components/AddSheet.tsx:89-99`
   and the page-level scroll-area padding).
   Today the FAB sits at `bottom: env(safe-area-inset-bottom) + 92px` on mobile; the bottom nav is
   `minHeight: 72px`. That leaves ~20px between them — on a long transaction list the LAST row sits
   under the FAB. Fix: add `padding-bottom: 112px` (or a `pb-28` utility) to the SCROLLABLE main
   container on the 3 mobile screens — Home, Transactions, Debts — so the last list row clears
   both the FAB and the nav. The FAB position itself stays put (it's correct).
   - Identify the main scrollable wrapper on each of the 3 screens (likely a `<main>` or
     `<div className="...">` near the top of the page client). Apply the padding only at the mobile
     breakpoint (`sm:` reset) so desktop is unchanged. If a layout-level `<main>` already exists,
     add it there ONCE rather than per-screen.

## 3. Verified background (file:line)

- `formatDate`: `src/app/(dashboard)/debts/DebtsClient.tsx:40-47`
- Given/taken summary cards: `src/app/(dashboard)/debts/DebtsClient.tsx:522-548`
- Home balance + KPI: `src/app/(dashboard)/page.tsx` (search for the balance section / `mainCurrency` prop)
- FAB: `src/components/AddSheet.tsx:89-99` (positioning)
- BottomNav: `src/components/BottomNav.tsx:74` (minHeight: 72px)
- Color tokens: `src/app/globals.css` — `--income`, `--income-wash`, `--expense`, `--expense-wash`,
  `--surface`, `--fg`, `--fg-subtle`, `--border` (don't add new tokens — reuse the existing ones).
- Currency helper: `src/lib/currency.ts` (`formatMoney`).

## 4. Files NOT to touch

- The TYPOGRAPHY rules in `globals.css` (h1/h2/h3 = serif). Intentional design.
- The donut chart palette / grouping (`src/components/HomeExpenseDonut.tsx`) — already correct.
- The transactions filter row, KPI card layout, empty states — already correct per the Lovable
  audit.
- Any new design tokens — reuse the existing palette.
- The bot, the STT layer, brain prompt, tests — out of scope.

## 5. Acceptance criteria

A. `npm run typecheck` → 0 errors.
B. `npm test` → 124/124.
C. `npm run build` → green.
D. `formatDate(null, "uz")` returns `"—"` (or whatever fallback chosen), not `"Invalid Date"`.
E. Given (berilgan) summary card uses NEUTRAL coloring (no `--income-*` tokens); taken card unchanged.
F. Home balance + KPI numbers each have a small muted secondary-currency line below (or no line if
   conversion impossible).
G. On mobile, the LAST row of a long list is fully visible — no part hidden by the FAB or nav.

## 6. Required tests

None. Visual change; verified by Opus + the user post-deploy.

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
- typecheck: <pass>
- test: <N / 124>
- build: <pass>

## Deviations from spec
- ...

## Tempted-but-skipped
- ...
```

## 9. Out of scope (DO NOT do)

- DO NOT touch git, commits, deploys — Opus handles.
- DO NOT redesign anything beyond these 4 bugs.
- DO NOT change typography, donut chart, KPI grid, settings icons, logout button, empty states,
  filter chips — verified-good per the audit.
- DO NOT add new design tokens or restructure `globals.css` color variables.
- DO NOT change Prisma schema or DB types.
