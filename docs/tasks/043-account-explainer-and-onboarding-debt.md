# Task 043 — Account-balance explainer + onboarding mentions debts

**Status:** SPEC · 2026-06-18 · Opus
**Owner agent:** Sonnet (`claude-sonnet-4-6`)

Two small clarity fixes (no DB, no logic — copy + one explainer line each).

## A. Account-balance explainer (audit #5)

The /accounts page shows each account's balance (initial + that account's linked transactions). The
Home "Naqd qolgan / Umumiy balans" is a DIFFERENT number (all transactions). A user can wonder "why
is my account 5M but Home shows 10M?" — two legitimate concepts, no explanation.

Fix: add a one-line muted explainer at the top of `src/app/(dashboard)/accounts/AccountsClient.tsx`
(above the account list, same style as the debts-page explainer from task 031: `text-xs`,
`var(--fg-subtle)`):
- i18n `accounts.explainer`:
  - uz: `Har bir hisob balansi = boshlang'ich summa + shu hisobga bog'langan yozuvlar. Bosh sahifadagi umumiy balans esa barcha yozuvlarni hisoblaydi.`
  - ru: `Баланс каждого счёта = начальная сумма + операции этого счёта. Общий баланс на главной учитывает все операции.`
  - en: `Each account's balance = its starting amount + the transactions linked to it. The total balance on Home counts all transactions.`

## B. Onboarding mentions debts

`src/app/onboarding/*` (find the onboarding page/client) currently shows examples for expense/income
(`onboarding.example1/2/3` = logistika / sotuv / ijara) but never mentions DEBTS, so new users don't
discover that debts are tracked. Add ONE debt example + a short line.

Find where `onboarding.example1/2/3` are rendered. Add:
- A new example string `onboarding.example_debt`:
  - uz: `Sarvarga 1 mln berdim` · ru: `Дал Сарвару 1 млн в долг` · en: `Lent Sarvar 1M`
- A short caption `onboarding.debt_hint`:
  - uz: `Qarzlarni ham shunchaki yozing — kim qancha qarz, alohida hisoblanadi.`
  - ru: `Долги тоже просто пишите — кто кому должен, считается отдельно.`
  - en: `Just write debts too — who owes what is tracked separately.`
Render the debt example in the same list/style as the other examples, with the hint below it. Keep
it minimal — one example + one line, matching the existing visual pattern.

## Verified background
- `src/app/(dashboard)/accounts/AccountsClient.tsx` — the account list header area (top of the
  returned JSX). Look at how `src/app/(dashboard)/debts/DebtsClient.tsx` renders `debt.explainer`
  (task 031) and mirror it.
- `src/app/onboarding/` — the onboarding page + any client; grep for `onboarding.example1`.
- `src/lib/i18n/dictionaries.ts` — `onboarding.*` keys block + where to add `accounts.explainer`.

## Files to touch
- `src/app/(dashboard)/accounts/AccountsClient.tsx`
- the onboarding component that renders the examples
- `src/lib/i18n/dictionaries.ts`

## Files NOT to touch
- DB, services, API, Home, the bot, STT, cron.

## Acceptance criteria
A. `npm run typecheck` + `npm test` (124/124) + `npm run build` green.
B. /accounts shows the one-line explainer above the list.
C. Onboarding shows a debt example + hint alongside the existing examples.
D. All new i18n keys in uz/ru/en.

## Gate commands
```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
npm run typecheck
npm test
npm run build
```

## Final report shape
```
## Files changed / Gate results / Deviations / Tempted-but-skipped
```

## Out of scope
- DO NOT touch git/deploy (Opus verifies on a real preview).
- DO NOT change account/transaction logic — copy only.
- DO NOT touch the bot.
