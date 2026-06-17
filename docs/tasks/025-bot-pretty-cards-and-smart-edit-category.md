# Task 025 — Bot: pretty confirmation CARDS + smart, type-aware EDIT category picker

Owner feedback (real use): the flat one-line confirmation `✅ Yozildi: 60 so'm, chiqim, oziq-ovqat, bugun.`
is ugly/unclear; he wants the clean multi-line card he liked. And in EDIT, the category buttons show an
arbitrary fixed list (same for everyone) instead of the ones closest to what THIS user means, and there is
no "type your own" option. North star: **simple, clear, a 12-year-old understands it, and convenient.**

## Background (verified, file:line)
- `formatConfirmation` — `src/lib/telegram/reply.ts:233-277` — builds the flat `✅ Yozildi: a, b, c.` line.
  Caller `finalizeLog` — `src/lib/telegram/bot.ts:148-203` — also has `note`, `originalAmount`,
  `originalCurrency`, builds `[✏️ Tahrirla][🗑 O'chir]` keyboard + budget alert append.
- `buildDebtCard` — `bot.ts:241-279` — flat `✅ Qarz saqlandi: …` (no date passed in).
- `formatAmount(bigint, lang)` — `reply.ts:5-17` — `"60 000 so'm"` / `"… сум"`. REUSE as-is.
- Edit category picker — `bot.ts:~1700-1715` — fetches `prisma.category.findMany({ where:{userId, type:tx.type}, take:6 })`
  in DB order (TYPE FILTER already correct), maps to `ec:<id>` buttons; **NO "Boshqa" button**.
- Edit typed-text handler — `bot.ts:~459-494` (`pending.intent === "edit_tx"`, currently only `field:"amount"`).
- Clarify flow already has a "✏️ Boshqa" (`c:other`) — mirror it for edit.
- `resolveOrCreateCategory(userId, name, type)` — `src/lib/services/categories.ts:75-100` — creates/returns a
  category with the CORRECT type. REUSE for the edit "Boshqa" path.
- `showUpdatedTx` — `bot.ts` — re-renders a tx after edit; should reuse the new card.
- Category model has `type` (income|expense) + optional `emoji` — `prisma/schema.prisma:54-68`.

## Part A — Pretty confirmation CARDS (transactions + debts)

Replace the flat lines with a clean multi-line card. Keep emoji tasteful (≤4 lines). Use colour as a
signal: **🟢 Kirim / income**, **🔴 Chiqim / expense**.

### A1. Transaction card — rewrite `formatConfirmation` (reply.ts)
New output (uz; ru/en parallel). Headline **"✅ Saqladim" / "✅ Сохранил" / "✅ Saved"**:
```
✅ Saqladim
🔴 Chiqim · 60 000 so'm
🗂 Oziq-ovqat
📅 Bugun
```
- Line 2: `🟢 Kirim` (income) or `🔴 Chiqim` (expense) + ` · ` + `formatAmount(amount,lang)`.
- Line 3 (🗂): category name — **omit the whole line if no category**.
- Line 4 (📅): date label — `Bugun/Kecha/<YYYY-MM-DD>` (ru `Сегодня/Вчера`, en `Today/Yesterday`).
- Keep the existing foreign-currency conversion info as an extra line (e.g. `💱 60 USD → CBU`), and keep the
  budget-alert append + keyboard at the call site UNCHANGED. The function returns the multi-line string.
- ru: `✅ Сохранил / 🔴 Расход / 🟢 Доход / 🗂 <cat> / 📅 <date>`. en: `✅ Saved / 🔴 Expense / 🟢 Income / 🗂 <cat> / 📅 <date>`.

### A2. Debt card — rewrite `buildDebtCard` (bot.ts) into the same shape
```
✅ Saqladim
🤝 Sarvarga berdingiz
💵 5 000 000 so'm
📅 Bugun
```
- Headline: saved → `✅ Saqladim`; updated → `✅ Yangiladim` (ru `Сохранил/Обновил`, en `Saved/Updated`).
- Line 2 (🤝): `<name>ga berdingiz` (given) / `<name>dan oldingiz` (taken) — ru `<name>у дали` / `у <name> взяли`,
  en `lent to <name>` / `borrowed from <name>`.
- Line 3 (💵): `formatAmount`.
- Line 4 (📅): date. **Pass the date in**: add an optional `occurredAt: Date` (or a `dateLabel` string) param to
  `buildDebtCard` and have every caller pass it (log path has the `dateStr`; edit/direction paths can format
  `debt.occurredAt` via the existing date util in `src/lib/dates.ts`). If a date truly isn't available, omit line 4.
- Keep the `[✏️ Tahrirla][🗑 O'chir]` keyboard exactly as now.

Both cards must stay **byte-clean UTF-8**; match the existing inline-ternary localization style.

## Part B — Smart, type-aware EDIT category picker + "✏️ Boshqa"

### B1. New helper `getSmartCategories` (src/lib/services/categories.ts)
`getSmartCategories(userId, type: TxType, hint?: string|null, limit=5): Promise<{id:string; name:string}[]>`
- Fetch the user's categories of that `type`.
- Usage counts: one `prisma.transaction.groupBy({ by:['categoryId'], where:{ userId, type, deletedAt:null }, _count:{_all:true} })`.
- Score each category: `usageCount`; **+1000** if `hint` is non-empty AND (catName ⊆ hint OR hint ⊆ catName, case-insensitive, locale-lowercased).
- Sort by score desc, then name asc. Return top `limit` (`{id,name}` only).
- Personalised (each user's most-used first) → NOT the same fixed list for everyone; input-relevant when a hint exists.
- Add a focused unit test (usage ranking + hint boost).

### B2. Use it in the edit picker (bot.ts `e:<txId>`)
- Replace the `take:6` DB-order fetch with `getSmartCategories(user.id, tx.type, tx.note, 6)`.
- Append a **"✏️ Boshqa"** button (uz `✏️ Boshqa`, ru `✏️ Другое`, en `✏️ Other`) with callback `ec:other`,
  on its own row (after the category buttons, before/with the amount row). Keep type-toggle + amount + delete as now.

### B3. Wire the "type your own" edit path
- New callback `ec:other`: set `PendingAction { intent:"edit_tx", draft:{ txId, field:"category_text" } }` +
  `ctx.reply("Kategoriya nomini yozing:", { reply_markup:{ force_reply:true } })` (ru `Введите название категории:`,
  en `Enter the category name:`). Need the txId — carry it in the edit-window pending draft (the `e:` handler
  should store the current txId in pending so `ec:other` knows it), OR encode it as `ec:other:<txId>`. Prefer
  encoding the id: `ec:other:<txId>` (callback stays < 64 bytes).
- In the `edit_tx` typed-text handler (bot.ts ~459), add a `field === "category_text"` branch (LITERAL, no brain):
  - `name = text.trim()`; if empty → re-ask.
  - `catId = await resolveOrCreateCategory(user.id, name, tx.type)` (type from the tx being edited).
  - verify tx ownership (`findFirst {id, userId, deletedAt:null}`) → if missing, notFound.
  - `prisma.transaction.update({ where:{id, userId}, data:{ categoryId: catId } })`; clear pending;
    `showUpdatedTx(...)` (renders the new card). MUST return — never fall through to `runBrain`.

## Part C — keep type-filtering as-is
The edit picker is already `where:{userId, type:tx.type}` — KEEP it. Do not change default-category seeds in this task
(the "oylik/komunal feel irrelevant" concern is a separate product-catalog decision — leave for a later consult).

## Do NOT touch
- Claude brain/tools/prompts. Dashboard / accounts / analytics / budgets / import-export. Debt edit field-flow
  logic (only `buildDebtCard`’s rendering + the date param change). `prisma/schema.prisma` (no migration).

## Tests
- Update any test asserting the OLD `✅ Yozildi: a, b, c.` flat string (likely a reply/confirmation test) to the new
  multi-line card.
- Add `getSmartCategories` unit test (usage ranking + hint boost + limit + type scoping). Unique ids per run if it
  hits the shared dev DB.

## Gates (PowerShell, prefix `$env:Path = "C:\Program Files\nodejs;" + $env:Path`)
`npm run typecheck` (0) · `npm test` (all green; count drifts) · `npm run build` (ok).

## Verification (live bot @oson_moliya_bot, after deploy)
1. "logistikaga 60 ming chiqim" → clean card: `✅ Saqladim / 🔴 Chiqim · 60 000 so'm / 🗂 logistika / 📅 Bugun` + [✏️ Tahrirla][🗑 O'chir].
2. "Sarvarga 5 mln qarz berdim" → `✅ Saqladim / 🤝 Sarvarga berdingiz / 💵 5 000 000 so'm / 📅 Bugun` + buttons.
3. ✏️ Tahrirla on a tx → category list shows the user's most-used (type-correct) first + **✏️ Boshqa**.
4. ✏️ Boshqa → type "qurilish" → category becomes "qurilish" (created with the tx's type) → updated card.
5. Income tx edit shows only income categories; expense only expense.
6. Gates green; review diff; deploy.

## Rules for the implementing agent
Read this spec + the files first. Edit/Write UTF-8 only. Additive DB only; no migration. No git/commit/deploy. Do
NOT touch docs/STATE.md or .env. Match surrounding code style. Run the gates yourself; report files changed + gate
results + deviations.
