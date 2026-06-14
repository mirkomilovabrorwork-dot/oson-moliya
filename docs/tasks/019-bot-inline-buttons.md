# Task 019 — Minimal bot inline buttons (Commit 2, separate + revertible)

## Goal (user-requested, after testing the text clarify)
Add the TWO tappable buttons that remove real friction — keep it minimal (#1 rule: calm, ≤ one button
row, never a wall). **Additive: the existing text clarify/correct/delete pipeline MUST keep working
unchanged as the permanent fallback.** This is the HIGHEST-risk change (new `callbackQuery` code,
untestable in this env) → separate revertible commit; the user phone-verifies on @oson_moliya_bot.

1. **Type-clarify buttons:** when the bot must ask income-vs-expense, show **[🟢 Kirim] [🔴 Chiqim]**
   (the exact friction the user hit: bot asked "kirim yoki chiqim?" as text).
2. **Post-save delete button:** on a successful log, attach **[🗑 O'chirish]** → confirm **[Ha, o'chir] [Yo'q]** → soft-delete.

DROPPED (do NOT add): edit button, category-picker buttons, any 2nd voice echo, buttons on query/correction replies.

## Files (ONLY these)
`src/lib/telegram/bot.ts`, `src/lib/telegram/reply.ts`. No other files. No DB migration. No git/gates (orchestrator does).

## Implementation
### A. Refactor the log-save into a reusable helper (so a button callback can finish a clarified save)
In `bot.ts`, extract the existing "create tx → store lastTransactionId pending → build confirmation →
budget-alert → reply" block (currently ~lines 172-252) into a helper, e.g.
`async function finalizeLog(ctx-like, user, prisma, { amount, txType, category, date, note }, lang)`.
The current inline log path calls it; the type-callback (below) also calls it. Keep behavior IDENTICAL
(same confirmation text, same budget-alert, same dashboard reply markup) — just make it callable.

### B. Type-clarify buttons (in the `clarify_needed` branch, ~line 256)
- Detect "type is the missing field": the draft has a non-null `amount` but `type`/`intent` is unresolved
  (income vs expense unknown). In that case, after storing the PendingAction (as today), send `reply_text`
  WITH an inline keyboard: `[[{text:"🟢 Kirim",callback_data:"t:income"},{text:"🔴 Chiqim",callback_data:"t:expense"}]]`
  (labels localized uz/ru/en via a small helper in reply.ts). If amount is the missing field → keep the
  current plain-text question (NO buttons).
- Keep storing the PendingAction draft exactly as today (so typing also still works).

### C. `bot.callbackQuery` handler (NEW — add once, near the other bot.on handlers)
Wrap EVERYTHING in try/catch; ALWAYS call `ctx.answerCallbackQuery()` (no spinner hang). Resolve the user
by `ctx.from.id` (upsert as elsewhere). Branch on `ctx.callbackQuery.data`:
- **`t:income` / `t:expense`** → load the user's pending `clarify_needed` action; if missing/expired →
  `answerCallbackQuery` + reply "Muddati tugadi, qaytadan yozing." (localized). Else: read the draft
  (amount/category/date/note), set txType from the button, and call `finalizeLog(...)`. Clear the pending.
  (Preserve the draft's other fields; this resolves the income/expense ambiguity the user hit.)
- **`d:<txId>`** → `answerCallbackQuery`; reply (or edit) a confirm row:
  `[[{text:"✅ Ha, o'chir",callback_data:"dy:<txId>"},{text:"Yo'q",callback_data:"dn"}]]` (localized).
- **`dy:<txId>`** → verify the tx exists, belongs to THIS user, and `deletedAt` is null; soft-delete
  (`deletedAt = new Date()`); `answerCallbackQuery` + reply "🗑 O'chirildi." (localized). If not found/owned → "Topilmadi."
- **`dn`** → `answerCallbackQuery` + a brief "Bekor qilindi." (or just dismiss).
- Unknown data → `answerCallbackQuery` (no-op).
Safety: ownership check on every tx access; SOFT-delete only; `callback_data` stays tiny (txId is a cuid,
well under Telegram's 64-byte limit); a callback failure must never throw out of the handler.

### D. Attach the delete button on successful logs
In `finalizeLog`, the final `ctx.reply(confirmation + budgetWarning + dashConfirm.extraText, {...})` —
merge a `[🗑 O'chirish]` button (callback_data `d:<tx.id>`) INTO the existing `reply_markup`
(`dashConfirm.reply_markup` may already hold the dashboard web_app button — combine into one
`inline_keyboard` with the dashboard button on its own row and the 🗑 button on a second row; if there is
no dashboard markup, just send the 🗑 row). One extra row max — stay calm.

### E. reply.ts — localized button labels (uz/ru/en)
Add a tiny helper exporting the localized strings: Kirim/Доход/Income, Chiqim/Расход/Expense,
🗑 O'chirish/🗑 Удалить/🗑 Delete, "✅ Ha, o'chir"/"✅ Да, удалить"/"✅ Yes, delete", Yo'q/Нет/No,
"🗑 O'chirildi"/"🗑 Удалено"/"🗑 Deleted", "Muddati tugadi…"/expired, "Topilmadi"/not-found, "Bekor qilindi"/cancelled.

## Acceptance criteria
1. When the bot can't tell income vs expense, the question shows tappable **[🟢 Kirim] [🔴 Chiqim]**; tapping
   one completes the save with the correct type (and the confirmation appears). Typing "kirim/chiqim" STILL works.
2. Every successful log reply shows a **[🗑 O'chirish]** button; tapping → **[Ha, o'chir] [Yo'q]**;
   "Ha" soft-deletes that exact record (ownership-checked) and confirms; "Yo'q" dismisses.
3. The existing text flow (clarify by typing, "tuzat", "o'chir", finance query) is UNCHANGED and still works.
4. Bot never crashes on a callback (try/catch + always answerCallbackQuery); labels in uz/ru/en.
5. typecheck/test/build green (orchestrator verifies).

## Constraints
UTF-8 via Edit/Write. Touch ONLY bot.ts + reply.ts. Do NOT touch git/STATE/.env, no migration, no other files.
Preserve everything from Commit 1. Final report: files changed, the exact callback_data scheme used, and
anything you skipped.
