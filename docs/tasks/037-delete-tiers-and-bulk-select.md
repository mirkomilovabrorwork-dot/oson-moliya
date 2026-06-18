# Task 037 — Graduated delete confirmation + bulk multi-select

**Status:** SPEC · 2026-06-18 · Opus
**Owner agent:** Sonnet (`claude-sonnet-4-6`)

## 1. Goal

Fix the delete UX the user complained about. Today `TypedDeleteDialog` forces typing the word
"o'chirish" for EVERY single delete (too heavy), there's NO way to select+delete many at once, and
deleting one item has the same friction as deleting everything. Make confirmation GRADUATED and add
bulk select.

User's exact spec (2026-06-18):
- 1 item → easy, light warning (no typing).
- Many selected → stronger warning naming what's being deleted + a DOUBLE confirm ("roziman" twice;
  "tanlangan hamma narsa o'chishiga rozimisiz?").
- Only deleting ALL data → require typing "o'chirish".
- Today even one item makes you type — wrong.

This task = the DELETE flow (tiers + bulk select). The RESTORE flow (undo toast + Savatcha view) is
the next task (038). Soft-delete is already in place for Transaction/Debt/RecurringRule/DebtPayment,
so deletes here are already recoverable at the DB level — 038 surfaces the restore UI.

## 2. Three confirmation tiers (new shared components)

1. **`ConfirmDialog`** (NEW, `src/components/ConfirmDialog.tsx`) — LIGHT confirm for a SINGLE item.
   Props: `{ open, title, message, confirmLabel, cancelLabel, danger?, loading?, onConfirm, onCancel }`.
   Two buttons (Cancel + Confirm). Confirm is danger-colored (`var(--expense)`). NO typed input.
   Reuse the existing modal styling/overlay from TypedDeleteDialog (same backdrop, card).

2. **`BulkDeleteDialog`** (NEW, `src/components/BulkDeleteDialog.tsx`) — STRONG confirm for MANY items.
   Props: `{ open, count, itemsPreview: string[], onConfirm, onCancel, loading?, lang }`.
   - Shows "N ta yozuv o'chiriladi" (count) + a short preview list (first ~5 labels, "...va boshqalar"
     if more) so the user sees WHAT is being deleted.
   - Requires a DOUBLE confirmation: a checkbox "Roziman" must be ticked, THEN the danger button
     "O'chirish" enables. The button itself is the second confirm. (Two deliberate actions.)
   - Cancel + Delete buttons. Delete disabled until the checkbox is ticked.

3. **`TypedDeleteDialog`** (EXISTING) — keep it, but use it ONLY for the "delete ALL data" case
   (a future More-page action). Do NOT wire it to any single-item or normal bulk delete. (No new
   "delete all" surface is required in THIS task — just stop using TypedDeleteDialog for single
   items. If a "delete all data" action already exists in More, leave it on TypedDeleteDialog;
   otherwise leave TypedDeleteDialog in the codebase unused by the row deletes.)

## 3. Single-item delete → ConfirmDialog (replace TypedDeleteDialog + confirm())

Replace the per-row delete confirmation in each list with `ConfirmDialog`:
- `src/app/(dashboard)/transactions/TransactionsClient.tsx` — was TypedDeleteDialog (350-372) →
  ConfirmDialog. Message names the item (e.g. "'Non — 20 000 so'm' o'chirilsinmi?").
- `src/app/(dashboard)/categories/CategoriesClient.tsx` — was TypedDeleteDialog (213-236) →
  ConfirmDialog. KEEP the existing budget-exists `extraWarning` as part of the message.
- `src/app/(dashboard)/accounts/AccountsClient.tsx` — was TypedDeleteDialog (210-226) → ConfirmDialog.
- `src/app/(dashboard)/debts/DebtsClient.tsx` — was browser `confirm()` (249) → ConfirmDialog.
- `src/app/(dashboard)/recurring/RecurringClient.tsx` — was browser `confirm()` (148) → ConfirmDialog.

The underlying DELETE API calls stay the same. Only the confirmation UI changes.

## 4. Bulk multi-select (Transactions + Debts)

Add a select mode to the two highest-volume lists: **Transactions** and **Debts**. (Categories/
Accounts/Recurring are low-count — single delete is enough; do NOT add bulk there in this task.)

- A "Tanlash" (Select) toggle in the list header enters select mode.
- In select mode each row shows a checkbox; tapping toggles membership in a `Set<string>` of ids.
- A sticky action bar appears showing "N tanlandi" + a "O'chirish" button + "Bekor".
- "O'chirish" opens `BulkDeleteDialog` with the count + a preview of the selected rows' labels.
- On confirm: delete all selected. Implementation: call the existing single DELETE route per id via
  `Promise.all` (simple, correct; no new bulk API needed). Show a toast "N ta o'chirildi". Exit
  select mode + refresh.
- i18n keys: `bulk.select`, `bulk.selected_count` ("{n} tanlandi"), `bulk.delete`, `bulk.cancel`,
  `bulk.confirm_title`, `bulk.confirm_checkbox` ("Roziman — tanlangan hamma narsa o'chadi"),
  `bulk.deleted_toast` ("{n} ta o'chirildi"), `bulk.preview_more` ("...va yana {n} ta") — uz/ru/en.

## 5. i18n

Add for uz/ru/en:
- `confirm.delete_title` ("O'chirilsinmi?"), `confirm.delete_one` ("{item} o'chirilsinmi?"),
  `confirm.delete` ("O'chirish"), `confirm.cancel` ("Bekor") — for ConfirmDialog defaults.
- The `bulk.*` keys from §4.

## 6. Files to touch / create

- NEW `src/components/ConfirmDialog.tsx`
- NEW `src/components/BulkDeleteDialog.tsx`
- `src/app/(dashboard)/transactions/TransactionsClient.tsx` (ConfirmDialog + bulk select)
- `src/app/(dashboard)/debts/DebtsClient.tsx` (ConfirmDialog + bulk select)
- `src/app/(dashboard)/categories/CategoriesClient.tsx` (ConfirmDialog only)
- `src/app/(dashboard)/accounts/AccountsClient.tsx` (ConfirmDialog only)
- `src/app/(dashboard)/recurring/RecurringClient.tsx` (ConfirmDialog only)
- `src/lib/i18n/dictionaries.ts` (new keys, all 3 langs)

## 7. Files NOT to touch

- DELETE API routes / services — single delete is unchanged; bulk reuses single routes via Promise.all.
- DB schema — NO changes (soft-delete already exists where it matters; Category/Account hard-delete
  stays for now — restore-from-trash for those is task 038's concern).
- The bot, STT, brain, cron.
- TypedDeleteDialog component file — leave it as-is (just stop using it for single items).

## 8. Acceptance criteria

A. `npm run typecheck` + `npm test` (124/124) + `npm run build` green.
B. Deleting ONE transaction shows the light ConfirmDialog (two buttons, NO typing).
C. Same light dialog for single category/account/debt/recurring delete.
D. Transactions + Debts have a "Tanlash" mode; selecting N rows + Delete opens BulkDeleteDialog
   showing the count + a preview, requires ticking "Roziman", then deletes all on confirm.
E. No single-item delete requires typing "o'chirish" anymore.
F. TypedDeleteDialog is no longer invoked by any row delete (grep the clients — no TypedDeleteDialog
   usage left except a possible existing "delete all data" action).

## 9. Gate commands

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
npm run typecheck
npm test
npm run build
```

## 10. Final report shape

```
## Files changed / Gate results / Deviations / Tempted-but-skipped
```

## 11. Out of scope (task 038, do NOT do here)

- Undo toast (Toast action button) + Savatcha (deleted-items restore view).
- Adding `deletedAt` to Category/Account/Budget.
- Any DELETE API / service change.
- Bulk select on Categories/Accounts/Recurring.
- Git, deploy — Opus handles + verifies on a real preview.
