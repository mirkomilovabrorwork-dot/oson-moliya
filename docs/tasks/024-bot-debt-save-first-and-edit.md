# Task 024 — Bot: debt save-first confirmation + working field-edit (name/amount/direction)

Approved plan: `C:\Users\localhost\.claude\plans\oson-moliya-distributed-pelican.md` (read it first).

## Goal
The Telegram bot must treat a DEBT like a transaction: **save immediately**, confirm with a clear
past-tense message, and **always** show [✏️ Tahrirla][🗑 O'chir]. The Edit button must let the user
fix the wrong field (name / amount / direction) by a **literal reply** — never re-parsed by the brain.
Fixes the real bug: a misheard debt name ("Sarvar" → "Sarovar") could not be corrected from the bot.

## Background — verified anchors (file:line in `src/lib/telegram/bot.ts` unless noted)
- Transaction confirmation already attaches `[edit, delete]` (~191–200); typed amount-edit handler =
  `pending.intent === "edit_tx"` block (459–494) — COPY this pattern for debts.
- Debt log handler `intent === "log_debt"` (596–677): currently stores a `confirm_debt` pending draft
  and shows a `📋 Qarz tushundim …` summary with `dbt:ok`/`dbt:edit` (direction known) or
  `dd:given`/`dd:taken` + `dbt:edit` (direction unknown). **This pre-confirm gate is what we remove.**
- Debt callbacks: `dbt:ok` (1782–1829) creates the debt; `dbt:edit` (1832–1849) clears + "retype";
  `dd:given`/`dd:taken` (1851–1893) create the debt from the draft. The single `callbackQuery`
  handler wraps everything in try/catch and always `answerCallbackQuery()` (1896–1904).
- Services `src/lib/services/debts.ts`: `createDebt` returns the created row (has `.id`);
  `updateDebt(id, userId, input)` returns `null` if not owner (currently sets counterparty/amount/
  note/occurredAt — **does NOT set direction**); `deleteDebt(id, userId)` already **soft-deletes**
  (`deletedAt`). Reuse these.
- Helpers in scope: `formatAmount(bigint, lang)`, `dateStringToUtc`, `parseAmountUzs(text)`,
  `getPendingAction`/`upsertPendingAction`/`clearPendingAction`, `dashboardReplyOptions(userId)`,
  `getBotLabels(lang)` (has `notFoundMsg`, `expiredMsg`).

## Changes

### A. `src/lib/services/debts.ts` (additive)
- Add `direction?: DebtDirection` to `UpdateDebtInput` and set `direction: input.direction` in the
  `updateDebt` `data`. No DB migration (column exists).

### B. `src/lib/telegram/bot.ts` — one cohesive edit

1. **Add a small reusable helper** (module-level), e.g.
   `function buildDebtCard(debt, lang, mode: "saved" | "updated"): { text, reply_markup }`:
   - body line: `given` → `<cp>ga berdingiz`, `taken` → `<cp>dan oldingiz` (ru/en variants exactly as
     the current dirPart strings at 1812–1815). Headline: `saved` → `✅ Qarz saqlandi:` /
     `✅ Долг сохранён:` / `✅ Debt saved:`; `updated` → `✅ Qarz yangilandi:` /
     `✅ Долг обновлён:` / `✅ Debt updated:`.
   - keyboard rows: `[[ {✏️ Tahrirla, de:<id>}, {🗑 O'chir, dx:<id>} ]]`. Keep inline-ternary
     localization, matching the surrounding debt code (do NOT move strings into reply.ts).

2. **`log_debt` handler (596–677): save-first.**
   - Keep the "missing amount or counterparty → ask to retype" guard (604–624) as is.
   - If `direction !== null`: **createDebt immediately** (occurredAt = `dateStringToUtc(dateStr)`),
     then `ctx.reply(buildDebtCard(created, lang, "saved").text, { reply_markup: merge keyboard +
     dashboardReplyOptions row })`. Remove the `confirm_debt` pending + the `dbt:ok`/`dbt:edit`
     summary for this case.
   - If `direction === null`: keep storing the `confirm_debt` draft and show ONLY
     `[↗️ Men berdim (dd:given)] [↙️ Men oldim (dd:taken)]` (drop the `dbt:edit` row). A short prompt
     like the current `📋 …` summary is fine, but it must read as a question ("yo'nalishini tanlang").

3. **`dd:given`/`dd:taken` (1851–1893):** after `createDebt`, reply with `buildDebtCard(created, lang,
   "saved")` keyboard (so edit/delete buttons appear) + dashboard row. (Currently no buttons.)

4. **Remove** the now-unreachable `dbt:ok` (1782–1829) and `dbt:edit` (1832–1849) handlers.

5. **New debt-edit callbacks** (add in the callbackQuery handler; each ownership-safe, always
   `answerCallbackQuery`, inside the existing try/catch):
   - `de:<id>` → reply field picker:
     `[✏️ Ism (def:n:<id>)] [💰 Summa (def:a:<id>)] [↔️ Yo'nalishi (def:d:<id>)]` (uz/ru/en labels).
   - `def:n:<id>` → `upsertPendingAction(user.id, { intent:"edit_debt", draft:{ debtId:id, field:"name" }, question:"" })`
     + `ctx.reply("Yangi ismni yozing:", { reply_markup:{ force_reply:true } })` (localized).
   - `def:a:<id>` → same with `field:"amount"`, prompt "Yangi summani yozing:".
   - `def:d:<id>` → reply `[↗️ Men berdim (ded:g:<id>)] [↙️ Men oldim (ded:t:<id>)]`.
   - `ded:g:<id>` / `ded:t:<id>` → `updateDebt(id, user.id, { direction: given|taken })`; if `null` →
     `getBotLabels(lang).notFoundMsg`; else reply `buildDebtCard(updated, lang, "updated")`.
   - `dx:<id>` → reply confirm `[Ha, o'chir (dxk:<id>)] [Yo'q (noop:cancel)]`.
   - `dxk:<id>` → `deleteDebt(id, user.id)`; if `null` → notFound; else reply `🗑 Qarz o'chirildi`
     (localized). `noop:cancel` → just `answerCallbackQuery` + optional "Bekor qilindi".
   - Callback data stays well under 64 bytes (cuid ≈ 25 chars; prefixes short).

6. **`edit_debt` typed-reply handler** — add right AFTER the `edit_tx` block (~494), mirroring it:
   ```
   if (pending && pending.intent === "edit_debt") {
     const ed = pending.draft; const debtId = ed.debtId;
     if (ed.field === "name") {
       const newName = text.trim();
       if (!newName) { reply "Ismni yozing"; return; }
       const updated = await updateDebt(debtId, user.id, { counterparty: newName });
       if (!updated) { clearPending; reply notFoundMsg; return; }
       clearPending; reply buildDebtCard(updated, lang, "updated"); return;
     }
     if (ed.field === "amount") {
       const amt = parseAmountUzs(text);
       if (amt === null || amt <= 0n) { reply "Summani tushunmadim…"; return; }
       const updated = await updateDebt(debtId, user.id, { amountUzs: amt });
       if (!updated) { clearPending; reply notFoundMsg; return; }
       clearPending; reply buildDebtCard(updated, lang, "updated"); return;
     }
   }
   ```
   CRITICAL: this path is **literal** — it must NOT fall through to `runBrain`. This is the core bug fix.

### Do NOT touch
- `prisma/schema.prisma` (no migration). `src/lib/claude/*` (no brain change). Dashboard / accounts /
  analytics / budgets / import-export. Transaction confirmation/edit (already correct).

## Tests
- Add to the existing debts service test (or create `src/lib/services/debts.test.ts` if none): assert
  `updateDebt` persists a new `direction` and a literal `counterparty`. Use unique ids per run
  (pid + timestamp) if it hits the shared dev DB; the suite may be run twice.
- Bot callback flows are integration-heavy → no unit test required for them; main session + user verify live.

## Gate commands (run via PowerShell with `$env:Path = "C:\Program Files\nodejs;" + $env:Path`)
- `npm run typecheck` → 0 errors
- `npm test` → all green (count drifts; don't pin a number)
- `npm run build` → succeeds

## Rules for the implementing agent
- Read this spec + the plan + the three source files BEFORE editing.
- Edit via Edit/Write only, **UTF-8**. DB additive only. Do **NOT** run git / commit / deploy. Do
  **NOT** edit `docs/STATE.md` or `.env`.
- Match the surrounding code style (inline-ternary localization in the debt section).
- Run the gate commands yourself; final report = files changed + gate results + any deviations.
