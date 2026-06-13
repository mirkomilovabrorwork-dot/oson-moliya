# TASK 011 — Bot reply polish (Kissa-AI-parity confirmation)

**Goal:** make the bot's transaction confirmation as clean & rich as Kissa AI's: a labeled block + a first-
transaction welcome + inline Delete (and Dashboard) buttons. Touch ONLY the bot layer (`src/lib/telegram/*`,
and `src/lib/services/*` if a helper is needed). Do NOT touch the web UI, schema (unless Accounts already added
accountId), or `src/lib/types.ts`. Keep uz/ru/en.

## 1. Labeled confirmation block (`src/lib/telegram/reply.ts` `formatConfirmation`)
Replace the single-line confirm with a clean labeled block, e.g. (uz):
```
✅ Yozildi
Tur: Chiqim
Summa: −50 000 so'm
Kategoriya: Ovqat
Sana: 13.06.2026
Izoh: Lavash xaridi
```
- Expense amounts shown with a leading −, income with +. Use the existing manual space-group formatter.
- Localize all labels (Tur/Summa/Kategoriya/Sana/Izoh) in uz/ru/en. Omit lines that are empty (e.g. no note).
- When the Accounts module (009) exists, add a `Hisob: <account name>` line (guard so it's optional until then).

## 2. First-transaction welcome (`bot.ts`)
On a user's FIRST successful logged transaction (count their non-deleted transactions == 1 after insert, or
track a `welcomed` flag), prepend a short 🎉 welcome ("Tabriklaymiz! Bu birinchi yozuvingiz. Oson Moliya'ga
xush kelibsiz — endi kirim/chiqimlaringizni oson kuzatasiz."). Localized. Only once.

## 3. Inline buttons on the confirmation (`bot.ts` + `reply.ts`)
Add inline buttons under the confirmation:
- **📊 Dashboard** — existing magic-link (button on https / text on localhost via `dashboardReplyOptions`).
- **🗑 O'chirish** — a `callback_query` button that soft-deletes THAT transaction. Implement a grammY
  `bot.callbackQuery(/^del:(.+)$/, ...)` handler: verify the tx belongs to the user, soft-delete, answer the
  callback, and edit the message to show "🗑 O'chirildi". (Register `callback_query` in allowed_updates — the
  webhook setWebhook already lists it; ensure bot-dev polling also receives it.)
- (Skip "Share" for v1 unless trivial.)

## Constraints / gates
PowerShell PATH prefix. Keep the brain/parser contract intact (this is reply/handler layer only). No new deps.
typecheck + test + build green. Add/extend a small test for the formatter. Commit
`feat(bot): Kissa-style labeled confirmation + first-tx welcome + inline delete button`.
