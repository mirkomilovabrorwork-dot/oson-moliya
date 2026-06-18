# Task 038 — Undo toast + Savatcha (deleted-items restore)

**Status:** SPEC · 2026-06-18 · Opus
**Owner agent:** Sonnet (`claude-sonnet-4-6`)

## 1. Goal

The RESTORE half of the delete overhaul (037 did the delete tiers). Deletes are already soft
(deletedAt) for Transaction / Debt / RecurringRule, so the data survives — we just surface recovery:
- **Undo toast** — right after any delete (single OR bulk), show a toast with a "Bekor qilish" button
  for ~6 seconds that restores what was just deleted.
- **Savatcha** — a "O'chirilganlar" (deleted items) view under More, listing recently soft-deleted
  Transactions/Debts/Recurring with a "Qaytarish" (restore) button each.

Scope to the three entities that ALREADY have `deletedAt` (Transaction, Debt, RecurringRule).
Category/Account hard-delete today — leave them out of this task (no DB change here).

## 2. Toast action-button variant

`src/components/Toast.tsx` currently shows message + auto-dismiss. Add OPTIONAL action support:
- New props: `actionLabel?: string`, `onAction?: () => void`.
- When `actionLabel` is set, render a button after the message; tapping it calls `onAction` then
  dismisses. Keep the existing message-only behavior when the props are absent.
- Bump the default duration for action toasts to ~6000ms (more time to hit Undo).

## 3. Restore API (per entity)

Add a restore path for each soft-delete entity (mirror the existing soft-delete routes):
- `POST /api/transactions/[id]/restore` → `prisma.transaction.update({ where:{id,userId}, data:{ deletedAt: null } })` (ownership-scoped).
- `POST /api/debts/[id]/restore` → via a `restoreDebt(id, userId)` service (set deletedAt null).
- `POST /api/recurring/[id]/restore` → via a `restoreRule(id, userId)` service (set deletedAt null).
Each returns the restored row (serialized). Validate ownership + that the row is actually
soft-deleted. Keep it symmetric with the existing DELETE handlers' auth pattern.

## 4. Undo toast wiring (client lists)

In `TransactionsClient` and `DebtsClient` (and `RecurringClient` for single rule delete):
- After a successful SINGLE delete, show the toast with `actionLabel: t("undo.action")` and
  `onAction` = call the restore endpoint for that id → on success re-insert the row into local state
  + `router.refresh()` + a small "Qaytarildi" toast.
- After a successful BULK delete (Transactions/Debts), keep the deleted ids in a local array; the
  Undo action restores ALL of them (Promise.all over the restore routes).
- The toast message stays as today ("O'chirildi" / "N ta o'chirildi"); just add the action button.

## 5. Savatcha (deleted-items) view

- New page `src/app/(dashboard)/trash/page.tsx` (server) — load soft-deleted rows for the user across
  the three entities, newest first, limited to those deleted within the last 30 days. Use direct
  Prisma queries with `where: { userId, deletedAt: { not: null, gte: <30 days ago> } }`.
- New `src/app/(dashboard)/trash/TrashClient.tsx` — group by type (Yozuvlar / Qarzlar / Takroriy),
  each row shows a label + when it was deleted + a "Qaytarish" button calling the matching restore
  endpoint, then removing it from the list. Empty state: "Savatcha bo'sh".
- Add a "🗑 O'chirilganlar" row to `MoreClient.tsx` linking to `/trash`. New i18n `more.trash`.
- A small note at the top: "O'chirilgan yozuvlar 30 kun saqlanadi" (`trash.retention_note`).

## 6. i18n (uz/ru/en)

`undo.action` ("Bekor qilish" / "Отменить" / "Undo"), `undo.restored` ("Qaytarildi" / "Восстановлено"
/ "Restored"), `more.trash` ("O'chirilganlar" / "Удалённые" / "Deleted"), `trash.title`
("O'chirilganlar"), `trash.empty` ("Savatcha bo'sh"), `trash.restore` ("Qaytarish"),
`trash.retention_note` ("O'chirilgan yozuvlar 30 kun saqlanadi"), `trash.section.transactions`
("Yozuvlar"), `trash.section.debts` ("Qarzlar"), `trash.section.recurring` ("Takroriy"),
`trash.deleted_at` ("o'chirilgan: {date}").

## 7. Files to touch / create

- `src/components/Toast.tsx` (action variant)
- `src/app/api/transactions/[id]/restore/route.ts` (NEW)
- `src/app/api/debts/[id]/restore/route.ts` (NEW)
- `src/app/api/recurring/[id]/restore/route.ts` (NEW)
- `src/lib/services/debts.ts` (+restoreDebt), `src/lib/services/recurring.ts` (+restoreRule)
- `src/app/(dashboard)/transactions/TransactionsClient.tsx`, `debts/DebtsClient.tsx`,
  `recurring/RecurringClient.tsx` (undo wiring)
- `src/app/(dashboard)/trash/page.tsx` + `TrashClient.tsx` (NEW)
- `src/app/(dashboard)/more/MoreClient.tsx` (+trash link)
- `src/lib/i18n/dictionaries.ts` (new keys)

## 8. Files NOT to touch

- DB schema — NO change (the three entities already have deletedAt; Category/Account stay hard-delete
  this task).
- The brain/STT/cron, the 30-day PURGE cron (a later optional task — for now soft-deleted rows just
  accumulate; the Savatcha filters to 30 days for DISPLAY only).
- The delete confirmation tiers from 037 (unchanged).

## 9. Acceptance criteria

A. `npm run typecheck` + `npm test` (124/124) + `npm run build` green.
B. Deleting one transaction shows a toast with a working "Bekor qilish" that restores it.
C. Bulk delete shows an Undo that restores ALL deleted rows.
D. /trash lists soft-deleted Transactions/Debts/Recurring with working "Qaytarish"; empty state when
   none.
E. More has an "O'chirilganlar" entry → /trash.
F. Restore endpoints are ownership-scoped and only act on soft-deleted rows.

## 10. Gate commands
```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
npm run typecheck
npm test
npm run build
```

## 11. Out of scope
- DO NOT add deletedAt to Category/Account (separate future task).
- DO NOT build the 30-day purge cron now.
- DO NOT touch git/deploy (Opus verifies on a real preview).
- DO NOT touch the bot (parallel task 041 — different files).
