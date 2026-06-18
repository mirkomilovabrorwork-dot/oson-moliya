# Task 039 — Home hero declutter (remove duplicate "Bu oy" + clearer debt line)

**Status:** SPEC · 2026-06-18 · Opus
**Owner agent:** Sonnet (`claude-sonnet-4-6`)

## 1. Goal

The Home hero (green) card has 5 text lines and one is a DUPLICATE. User (on a real screen) found it
too busy. Two fixes:

- **A. Remove the "Bu oy: +X −Y" line from the hero card** — it duplicates the "Bu oy statistikasi"
  KPI grid right below (Daromad / Xarajat / Foyda). Pure repetition.
- **B. Make the debt-aside line SHORT but DIRECTION-CLEAR** — the user must see at ONE glance whether
  it's money they LENT (given) or money they BORROWED (taken). Current line is a long sentence.

## 2. Verified background (file:line)

- `src/app/page.tsx` hero card (~345-395): the primary number block, `balanceSecondary` USD line, the
  `hasOpenDebts` debt-aside `<Link>` (uses `home.debt_aside_given` / `home.debt_aside_taken`), and
  the "This-month context" `<p>` showing `home.month_summary` (the "Bu oy: +X −Y" line) — REMOVE that.
- `src/lib/i18n/dictionaries.ts` — `home.debt_aside_given` / `home.debt_aside_taken` (current long
  strings) + `home.month_summary` (becomes unused on the hero after removal — leave the key, it may
  be used elsewhere; just stop rendering it on the hero).

## 3. Fixes

### A. Remove the duplicate "Bu oy" line on the hero
In `src/app/page.tsx`, delete the hero-card `<p>` that renders the this-month income/expense summary
(the `home.month_summary` / "Bu oy: …" line that sits just below the debt-aside, before the budget
prompt). The KPI grid below already shows this. Do NOT touch the KPI grid itself.

### B. Shorter, direction-clear debt-aside
Rewrite the two debt-aside i18n strings to be SHORT and unambiguous about direction, with an arrow
icon baked in:
- `home.debt_aside_given` (net money LENT OUT — they're owed):
  - uz: `↗️ {amount} qarz berilgan — qaytishi kutiladi`
  - ru: `↗️ {amount} в долг отдано — ожидается возврат`
  - en: `↗️ {amount} lent out — expected back`
- `home.debt_aside_taken` (net money BORROWED — they owe):
  - uz: `↘️ {amount} qarz olingan — qaytarish kerak`
  - ru: `↘️ {amount} взято в долг — нужно вернуть`
  - en: `↘️ {amount} borrowed — to repay`

Keep it on ONE line, `text-xs`, the existing muted color, still a `<Link>` to `/debts`. The arrow +
"berilgan/olingan" makes the direction readable at a glance. (The page already picks given-vs-taken
by net `givenOpen − takenOpen`; keep that logic.)

## 4. Files to touch
- `src/app/page.tsx`
- `src/lib/i18n/dictionaries.ts`

## 5. Files NOT to touch
- The KPI grid (it stays — it's the canonical this-month view).
- The bot, STT, brain, cron, DB.
- Any other page.

## 6. Acceptance criteria
A. `npm run typecheck` + `npm test` (124/124) + `npm run build` green.
B. Hero card no longer shows the "Bu oy: +X −Y" line; the KPI grid below is unchanged.
C. Debt-aside line is short, one line, shows an arrow + "berilgan"/"olingan" so direction is obvious.
D. No-debt users: hero unchanged (single balance, no debt-aside).

## 7. Gate commands
```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
npm run typecheck
npm test
npm run build
```

## 8. Final report shape
```
## Files changed / Gate results / Deviations / Tempted-but-skipped
```

## 9. Out of scope
- DO NOT touch git/deploy (Opus verifies on a real preview).
- DO NOT change the KPI grid, the main balance, or the USD line.
- DO NOT touch brain/prompts (that's the parallel task 040 — different files).
