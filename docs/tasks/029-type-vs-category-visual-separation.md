# Task 029 — Type vs category: visual separation (bot edit flow + card flip button)

**Status:** SPEC · 2026-06-18 · Opus
**Owner agent:** Sonnet (`claude-sonnet-4-6`)

## 1. Goal

Eliminate the "income/expense looks like a category header" confusion in the bot. Two changes:

- **(A) Edit picker** — replace the two-pill type toggle (`🟢 Kirim` / `🔴 Chiqim` shown as twin buttons above categories) with a **single full-width action button** (`🔄 Kirimga aylantirish` / `🔄 Chiqimga aylantirish` — based on current type). Action verbs read as "do this", not "this is the section heading".
- **(B) Confirmation card** — add a **🔄 type-flip button** directly on the saved-card keyboard so type errors can be fixed in one tap, no menu.

## 2. Why

User screenshot (2026-06-18) confirmed the confusion: in the edit picker the type buttons sit in row 1 with the same pill shape as category buttons in rows 2+. Users read this as "Kirim is the section, the categories below belong to it". Brain classification has been correct — the problem is purely UX.

Action-shaped, full-width type button + putting type-flip on the card itself break the visual hierarchy: type and category become two separate things, and type errors are a one-tap fix.

## 3. Verified background (file:line — already mapped by Explore agent 2026-06-18)

- Confirmation card built: `src/lib/telegram/reply.ts:233-280` (`formatConfirmation()`) + `bot.ts:193-195` (Edit button row).
- Edit branch (Tahrirlash): `bot.ts:1748-1783` — fetches `getSmartCategories(user.id, tx.type, tx.note ?? null, 6)`, builds keyboard.
- Current keyboard rows (`bot.ts:1764-1777`):
  - Row 1: `[incomeBtn (et:income), expenseBtn (et:expense)]` ← TO REPLACE
  - Rows 2+: category pills (2 per row, callback `ec:<categoryId>`)
  - Row N: `✏️ Boshqa` (callback `ec:other:<txId>`)
  - Row last: `[💰 Summa, 🗑 O'chirish]`
- Existing type-change handlers: `et:income` / `et:expense` callbacks exist (per Explore report) and write `tx.type` + reassign category to a default of the new type.
- i18n labels live in `src/lib/telegram/reply.ts:25-151` (`getBotLabels(lang)`):
  - `incomeBtn`, `expenseBtn` (used as the twin pills today — KEEP for the categories page / other contexts; new strings are ADDED, not replacing)
  - `editBtn`, `deleteBtn`, `editFixWhatPrompt`, `editAmountLabel`, `otherCategoryBtn`

## 4. Files to touch

1. **`src/lib/telegram/reply.ts`** — add new i18n keys to `getBotLabels(lang)` for **uz/ru/en**:
   - `flipToIncomeBtn` — e.g. uz `"🔄 Kirimga aylantirish"`, ru `"🔄 Сделать доходом"`, en `"🔄 Switch to income"`
   - `flipToExpenseBtn` — uz `"🔄 Chiqimga aylantirish"`, ru `"🔄 Сделать расходом"`, en `"🔄 Switch to expense"`
   - `editPickerHeader(currentTypeIcon, currentTypeWord, categoryName, formattedAmount)` — a helper that returns a 2-line string:
     ```
     ✏️ Hozir: {icon} {type} · {category} · {amount}
     Nimani to'g'irlaymiz?
     ```
     Same shape for ru/en. Use existing helpers (`formatAmount(lang)` etc.) for the amount; do not reinvent.
   - DO NOT remove `incomeBtn` / `expenseBtn` — they may still be used elsewhere (search before deleting; if truly unused after this task, delete them in a SEPARATE follow-up commit, not this one).

2. **`src/lib/telegram/bot.ts` — edit branch (around lines 1748-1783):**
   - Replace the Row-1 twin-pill construction:
     ```js
     rows.push([
       { text: labels.incomeBtn, callback_data: "et:income" },
       { text: labels.expenseBtn, callback_data: "et:expense" },
     ]);
     ```
   - With a **single full-width action button** sized to flip to the OPPOSITE type:
     ```js
     const isExpense = tx.type === "expense";
     rows.push([{
       text: isExpense ? labels.flipToIncomeBtn : labels.flipToExpenseBtn,
       callback_data: isExpense ? "et:income" : "et:expense",
     }]);
     ```
     One button per row makes Telegram render it full-width; that visual difference (vs the 2-per-row category pills below) is what does the work. Same callback names (`et:income` / `et:expense`) — reuse the existing handlers, no handler changes.
   - Change the message text from the current bare `labels.editFixWhatPrompt` to the new header that shows the CURRENT type + category + amount + the prompt line. Use the new helper from reply.ts.

3. **`src/lib/telegram/bot.ts` — confirmation card keyboard (around lines 193-195):**
   - Current row: `[Tahrirlash, O'chirish]`.
   - After this task: keep that row, then ADD a new row below it with a SINGLE full-width type-flip button:
     ```js
     // Existing row stays:
     // [ editBtn, deleteBtn ]
     // NEW row appended:
     const isExpense = tx.type === "expense";
     rows.push([{
       text: isExpense ? labels.flipToIncomeBtn : labels.flipToExpenseBtn,
       callback_data: `ft:${tx.id}`,
     }]);
     ```
   - The full-width single button reads as a one-tap action below the two-button row above.

4. **`src/lib/telegram/bot.ts` — new callback handler `ft:<txId>`:**
   - Lookup tx by id, scoped to user.
   - Flip type: `newType = tx.type === "expense" ? "income" : "expense"`.
   - Pick a default category of the new type: prefer the user's category named `boshqa kirim` / `boshqa chiqim` (created by `ensureDefaultCategories`); fall back to the first owned category of `newType`. If none exists, leave `categoryId` unchanged — but the type still flips (user can then re-categorize).
   - Update `tx.type` + `tx.categoryId` in one Prisma call.
   - Reply with the updated confirmation card via the existing `showUpdatedTx(...)` helper (already used at `bot.ts:1830-1860`) so the user sees the result in the same shape they're used to. Update message text begins with `✅ Yangiladim` (existing pattern).
   - Same pattern Sonnet should mirror from the existing `ec:<categoryId>` handler — read it first, copy the structure.

## 5. Files NOT to touch

- `src/lib/stt/*` — task 028 just shipped; do not modify STT.
- `src/lib/categories.ts` and `getSmartCategories` — keep filtering by type unchanged.
- The web dashboard (`src/app/**`) — this task is bot-only.
- Tests — no test changes (existing tests pass; new bot UX is verified by manual real-bot test).
- Brain prompt / Claude tool schema — unchanged.

## 6. Acceptance criteria

A. `npm run typecheck` → 0 errors.
B. `npm test` → 124/124 pass.
C. `npm run build` → green.
D. New i18n keys present in all 3 languages; no missing-key fallbacks at runtime.
E. The `et:income` / `et:expense` callbacks still work (we only changed which button SENDS them, not the handler).
F. The new `ft:<txId>` callback path compiles and follows the same error handling as `ec:<categoryId>` (ownership check, clear pending action, etc.).
G. No regressions in `bot.ts` non-edit handlers — agent must visually confirm by re-reading the surrounding 50 lines after each edit.

## 7. Required tests

None added — UX-only bot change. Manual verification by Opus + the user after deploy:
- Tap Tahrirlash on a card → see the new full-width flip action button at the top, categories below.
- Tap the new card 🔄 flip button → tx type flips + category reassigned to "boshqa {new-type}" + updated card shown.
- Repeat the flow in ru/en (user locale) — buttons appear in the correct language.

## 8. Gate commands (PowerShell, repo root)

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
npm run typecheck
npm test
npm run build
```

## 9. Final report from agent

```
## Files changed
- ...

## Gate results
- typecheck: ...
- test: ... / 124
- build: ...

## Deviations from spec
- ...

## Tempted-but-skipped (refactor hygiene)
- ...
```

## 10. Out of scope (do NOT do)

- Do NOT touch git, do NOT commit, do NOT deploy — Opus handles that.
- Do NOT delete `incomeBtn` / `expenseBtn` strings in this task even if they look unused after the change — verify across the codebase first; cleanup goes in a SEPARATE commit.
- Do NOT redesign the category buttons themselves (they stay 2-per-row pills — that's correct).
- Do NOT add section-header buttons (full-width inline buttons with non-actionable text) — Telegram requires every button to have callback_data; placeholder buttons create dead taps.
- Do NOT change the confirmation card MESSAGE TEXT — only the keyboard gains a new button.
- Do NOT modify the STT layer (just-shipped task 028).
