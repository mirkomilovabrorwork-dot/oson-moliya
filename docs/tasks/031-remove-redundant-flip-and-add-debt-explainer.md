# Task 031 — Remove redundant flip-in-menu + add debt-vs-IE explainer

**Status:** SPEC · 2026-06-18 · Opus
**Owner agent:** Sonnet (`claude-sonnet-4-6`)

## 1. Goal

Two tiny fixes:

1. **Remove the type-flip action button from the bot edit picker** — duplicates the card-level flip
   button that task 029 added. One concept, one place.
2. **Add a one-line explanation on the Debts page** — "Qarzlar kirim/chiqimga qo'shilmaydi, pulingiz
   qaytishi kutilyapti" (uz/ru/en) — so non-accountant users don't wonder why their lent money
   doesn't show in expense totals.

## 2. Why

User correctly noticed redundancy: task 029 added a 🔄 flip button BOTH on the confirmation card AND
inside the Tahrirlash edit picker. The card is the one-tap fix; the menu is for category / amount /
delete. Type belongs only on the card.

User also asked whether debts should be merged into income/expense. Answer (researched + reasoned):
NO — debt is a receivable/payable, not realized income/expense. YNAB/Mint/Splitwise/1С all separate
them. Current architecture is correct; the gap is that the user doesn't SEE the reasoning. A single
line on the page makes it explicit.

## 3. Verified background (file:line)

- Edit picker keyboard build: `src/lib/telegram/bot.ts` around lines 1772-1777 (the single
  full-width flip button row that task 029 introduced — `et:income` / `et:expense` callback).
- Existing `et:income` / `et:expense` handlers stay UNCHANGED (they may still be used elsewhere; do
  not delete handler logic).
- Debts page header / subtitle: `src/app/(dashboard)/debts/DebtsClient.tsx` — locate the page heading
  (the section that renders the "Qarzlar" title and any intro copy) and add the explainer there.
- i18n strings: `src/lib/i18n.ts` (or wherever `t("debt.xxx", lang)` keys live). Find the
  `debt.given` / `debt.taken` keys to confirm the file, then add a new `debt.explainer` key for
  uz/ru/en.

## 4. Files to touch

1. **`src/lib/telegram/bot.ts`** — in the edit-picker branch (around 1772-1777), DELETE the flip-row
   construction:
   ```js
   const isExpenseEdit = tx.type === TxType.expense;
   rows.push([{
     text: isExpenseEdit ? labels.flipToIncomeBtn : labels.flipToExpenseBtn,
     callback_data: isExpenseEdit ? "et:income" : "et:expense",
   }]);
   ```
   The 2-per-row category pills become the FIRST keyboard rows. The `isExpenseEdit` variable was
   used only by the deleted row — remove it from the surrounding code (or leave it, whichever keeps
   the diff cleaner; typecheck will tell you).
   The message-header text (the `editPickerHeader(...)` call) STAYS — it still shows current type/cat/
   amount, which is useful context.

2. **`src/app/(dashboard)/debts/DebtsClient.tsx`** — add a small explainer paragraph below the
   page title (or above the summary cards if the title is in a layout). Style: small text
   (`text-xs` or `text-sm`), muted (`color: var(--fg-subtle)`), one line, no card box. The text
   comes from a new i18n key:
   - uz: `Qarzlar kirim va chiqimga qo'shilmaydi — pulingiz qaytishi kutilyapti.`
   - ru: `Долги не входят в доходы и расходы — деньги ожидаются обратно.`
   - en: `Debts are not added to income or expenses — the money is expected back.`

3. **`src/lib/i18n.ts`** (or wherever debt keys live) — add `debt.explainer` to the 3 language tables.

## 5. Files NOT to touch

- The card-level flip button row (added in task 029) — KEEP IT, that's the one place type-flip lives.
- The `et:income` / `et:expense` handler code — unchanged.
- The category buttons + amount + delete rows of the edit picker — unchanged.
- The bot voice/text handler, brain prompt, STT layer — out of scope.
- Web dashboard pages other than Debts — out of scope.
- Tests, git, deploys — Opus handles.

## 6. Acceptance criteria

A. `npm run typecheck` → 0 errors.
B. `npm test` → 124/124.
C. `npm run build` → green.
D. Bot edit picker keyboard rows: first row = category pills (2 per row), NOT a flip button.
E. Card-level flip button (from task 029) still appears on the confirmation card AND on the
   updated-card after edit (`finalizeLog` + `showUpdatedTx`).
F. Debts page renders a one-line muted explainer above the summary cards in the user's locale.

## 7. Gate commands (PowerShell, repo root)

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

- DO NOT touch git, commits, deploys.
- DO NOT remove the `et:income` / `et:expense` callback handlers — only the BUTTON that triggered
  them from the edit picker.
- DO NOT remove the card-level flip button — that's the one place type-flip lives now.
- DO NOT redesign the Debts page beyond adding the one-line explainer.
- DO NOT change the bot brain, STT, web auth, or any unrelated module.
