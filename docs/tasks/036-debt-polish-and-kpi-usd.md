# Task 036 — Debt terminology + "all/partial" payment + add-button on all tabs + KPI USD back

**Status:** SPEC · 2026-06-18 · Opus
**Owner agent:** Sonnet (`claude-sonnet-4-6`)

## 1. Goal

Four user-requested fixes, all on the Debts page + Home:

- **A. KPI USD back** — task 035 removed the USD secondary line from the 3 Home KPI cells. User
  reversed that call: in Uzbekistan both currencies are used equally, so show USD on the KPIs too.
- **B. Debt payment terminology** — "To'lov" (payment) reads wrong. Use direction-aware wording:
  money LENT (given) coming back = **"Qaytarildi"**; money BORROWED (taken) being repaid = **"To'ladim"**.
- **C. Quick "all / partial"** — in the payment modal, add a one-tap **"Hammasi"** button that fills
  the full remaining amount, so a full repayment is one tap (not manual typing). Manual amount stays
  for partial.
- **D. Add-debt button on ALL tabs** — the "+ Qarz qo'shish" entry must be obviously available on the
  "Barchasi" tab too (user couldn't find how to add from there).

## 2. Why

User feedback 2026-06-18: "qarz to'lov emas to'landi, qaytarildi deb yozsak... hammasi yoki summa
kiritish qilsak qulay; qarzlar barchasi menyusida ham qarz qo'shish + bo'lsin; kpi da ham usd kerak edi,
uzbda ikki valyuta birdek ishlaydi."

## 3. Verified background (file:line)

- `src/app/page.tsx` — KPI grid (~519-548). Task 035 removed `incomeSecondary`/`expenseSecondary`/
  `netSecondary` from the cells. The variables are STILL computed above (around 325-335) — just the
  rendering was removed. Re-add the rendering only.
- `src/app/(dashboard)/debts/DebtsClient.tsx`:
  - `showAdd` modal state (71), add-modal (336+), FAB area (~730 "add button replaced by fixed FAB").
  - Payment modal + `debt.add_payment` button (899), `paymentTarget`, `paymentAmount`, `handleAddPayment`.
  - `formatMoney` instance (63). Remaining math: `remainingUzs` per debt row (~801).
  - tab filter (320-321): given/taken/all.
- `src/lib/i18n/dictionaries.ts` — debt keys: `debt.add_payment`, `debt.payment.modal_title`,
  `debt.payment.amount_label`, `debt.paid`, `debt.add` (uz/ru/en ~282/622/962).

## 4. Files to touch

### Fix A — KPI USD (page.tsx)
Re-add the USD secondary `<p>` inside each of the 3 KPI cells, using the already-computed
`incomeSecondary` / `expenseSecondary` / `netSecondary`. Style: `text-xs`, `color: var(--fg-subtle)`,
one line under the so'm amount. (This reverts task 035 Fix B only — leave the main-balance USD line and
everything else from 035 as-is.)

### Fix B + C — payment terminology + "Hammasi" (DebtsClient.tsx + i18n)
- The per-debt "+ To'lov" button label becomes direction-aware:
  - given debt → `debt.mark_returned` = uz "↩️ Qaytarildi", ru "↩️ Возвращено", en "↩️ Returned"
  - taken debt → `debt.mark_repaid` = uz "↩️ To'ladim", ru "↩️ Оплачено", en "↩️ Repaid"
  (Pass the debt direction where the button is rendered to pick the label.)
- The payment modal title + amount label become direction-aware too:
  - given → title `debt.return.title` "Qaytarilganini belgilash", amount label "Qaytarilgan summa"
  - taken → title `debt.repay.title` "To'langanini belgilash", amount label "To'langan summa"
  (uz/ru/en for each.)
- Add a **"Hammasi"** button inside the modal, next to the amount input: on tap it sets
  `paymentAmount` to the debt's REMAINING amount (full payoff). Label `debt.payment.all` = uz
  "Hammasi", ru "Всё", en "All". Keep the manual input for partial amounts.
- Do NOT change the underlying API or `addDebtPayment` service — only labels + the prefill button.

### Fix D — add-debt button on all tabs (DebtsClient.tsx)
- Ensure the FAB ("+ Qarz qo'shish" → opens `setShowAdd(true)`) is rendered on ALL tabs including
  "Barchasi" (it's a fixed FAB, but confirm it's not conditionally hidden per-tab). If it's already
  always-on, additionally make it clearer: give the FAB a visible text label `debt.add` ("+ Qarz
  qo'shish") instead of a bare "+", matching the recurring-page pattern. The button must be reachable
  from the "Barchasi" tab.

## 5. Files NOT to touch

- The delete UX (that's task 037 next — do NOT start bulk-delete here).
- The bot, STT, brain, cron.
- DB schema — no changes.
- Other dashboard pages besides page.tsx (KPI) and DebtsClient.

## 6. Acceptance criteria

A. `npm run typecheck` + `npm test` (124/124) + `npm run build` green.
B. Home KPI cells (Income/Expense/Net) each show a USD `≈ $...` line again.
C. Given-debt payment button reads "Qaytarildi"; taken-debt reads "To'ladim" (in the user's lang).
D. Payment modal title/label is direction-aware; a "Hammasi" button fills the full remaining amount.
E. "+ Qarz qo'shish" is reachable from the Barchasi tab with a visible text label.
F. No regression to the partial-payment math or the existing modal submit.

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

- DO NOT touch git, deploy — Opus handles + verifies on a real mobile preview.
- DO NOT start the delete/bulk-delete work (task 037).
- DO NOT change DB schema or the payment API/service.
- DO NOT touch bot/STT/cron.
