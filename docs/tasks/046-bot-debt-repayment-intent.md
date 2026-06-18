# Task 046 — Bot debt-repayment intent ("Sarvar 2 mln qaytardi")

## Goal
Let a user record a DEBT REPAYMENT by voice/text in the bot, e.g. "Sarvar 2 mln qaytardi"
(Sarvar repaid me → pays down a debt I GAVE) or "Sarvarga 500 ming to'ladim" (I paid Sarvar →
pays down a debt I TOOK). Today the bot can only CREATE a debt (`log_debt`); repayments are
web-only. This adds a new brain intent `repay_debt` + a deterministic matcher + a picker for
the ambiguous case.

## Design principles (READ — this is the risky one)
- **The LLM extracts; deterministic code matches the DB.** The brain only classifies +
  extracts (counterparty name, amount, direction signal, "pay all" flag). It must NOT try to
  pick a specific debt row — it never sees the DB. Matching open debts is pure code + a service.
- **Conservative trigger = low regression.** `repay_debt` fires ONLY on clear REPAYMENT
  wording (qaytardi / qaytarib berdi / to'ladi / qarzini uzdi / вернул / отдал долг / погасил /
  repaid / paid back / settled). Plain "berdi/oldi" stays `log_income`/`log_expense`/`log_debt`
  EXACTLY as today. Do not broaden existing intents.
- **Never silently pay the wrong debt.** 0 matches → say so. 1 → apply. 2+ → ask with buttons.
- Money is BigInt whole so'm. Cap a payment to the remaining (you can't over-pay a debt).

## Verified background (file:line)
- Brain schema + tool def: `src/lib/claude/tools.ts` — Zod enum (29-41), tool input enum (74-88),
  reused fields already present: `amount` (44/99), `counterparty` (57/184), `debt_direction`
  (58/188), `date` (48/119). Add `repay_debt` to BOTH enums + add a new `repay_all` boolean
  to BOTH the Zod schema and the tool `input_schema.properties`.
- Prompt: `src/lib/claude/prompts.ts` — static prefix holds the intent rules (the part with
  `cache_control: ephemeral`). Add `repay_debt` rules near the `log_debt` rules. Dynamic suffix
  (date/categories/reply-lang) is unchanged.
- Brain schema tests: `tests/brain-schema.test.ts` — `parseOk()` / `parseFail()` pattern; a
  `debt_query` describe block exists (~329-393) as a template.
- Debt service: `src/lib/services/debts.ts`:
  - `listDebts(userId,{status})` returns Debt[] but WITHOUT payments → cannot compute remaining.
  - `getDebtTotals` (119-147) shows the pattern to fetch open debts WITH payments + compute remaining.
  - `getDebtWithPayments(debtId,userId)` (149-164) → one debt + `.remaining`.
  - `addDebtPayment({debtId,userId,amountUzs,occurredAt,note})` (166-210): throws `EXCEEDS_REMAINING`
    if amount > remaining, `AMOUNT_INVALID` if <=0; auto-settles when fully paid. Returns {payment,debt}.
- Bot dispatch + helpers: `src/lib/telegram/bot.ts`:
  - `log_debt` block (770-845) — the template: extracts counterparty/direction/amount, uses
    `createDebt`, `clearPendingAction`, `upsertPendingAction`, `formatAmount(BigInt, lang)`,
    `dateStringToUtc(dateStr)`, inline uz/ru/en ternaries for messages, `force_reply` asks.
  - Direction-unknown debt stores `upsertPendingAction(user.id,{intent:"confirm_debt",draft,question})`
    and shows `dd:given`/`dd:taken` buttons; the `dd:` callback (~2007) consumes the pending.
  - Other debt callbacks `de:`/`def:`/`ded:`/`dx:`/`dxk:` live ~2040-2160 — mirror their style.
  - `user` (the row) and `lang` are already in scope inside `handleMessage`.
- i18n style for bot dispatch messages = INLINE ternary (uz/ru/en) as in `log_debt`. Use inline
  ternaries here too (do NOT add keys to dictionaries.ts for these).

## Files to TOUCH
- `src/lib/claude/tools.ts` — add `repay_debt` intent + `repay_all` field (both Zod + tool schema).
- `src/lib/claude/prompts.ts` — add `repay_debt` classification rules (+ disambiguation note).
- `src/lib/services/debts.ts` — add `listOpenDebtsWithRemaining(userId)`.
- `src/lib/services/debtMatch.ts` — NEW pure matcher (no I/O).
- `src/lib/telegram/bot.ts` — add the `repay_debt` dispatch block + the `rp:` picker callback.
- `tests/debt-match.test.ts` — NEW unit tests for the matcher.
- `tests/brain-schema.test.ts` — add `repay_debt` schema cases.

## Files NOT to touch
- DB schema / `prisma/schema.prisma` (NO migration — reuses Debt/DebtPayment).
- The web debt routes/UI, dictionaries.ts, any other intent's rules or dispatch.
- The in-memory limiter / costly-cap from task 044.

## Schema additions — `tools.ts`
- Add `"repay_debt"` to the Zod `intent` enum (29-41) AND the tool `input_schema` intent enum (74-88).
- Add to Zod schema (near counterparty/debt_direction):
  ```ts
  repay_all: z.boolean().default(false),
  ```
- Add to tool `input_schema.properties`:
  ```ts
  repay_all: {
    type: "boolean",
    description: "true only when the user says the debt was repaid IN FULL (hammasini/to'liq/полностью/in full). Then amount may be null.",
  },
  ```

## Prompt rules — `prompts.ts` (add near log_debt rules, in the static/cacheable prefix)
Add an intent description, in the same terse style as the others:
```
- repay_debt: an EXISTING debt is being PAID BACK (not a new debt, not normal income/expense).
  Trigger ONLY on repayment wording:
    uz: qaytardi / qaytarib berdi / qaytardim / to'ladi / to'ladim / qarzini uzdi / qarzini yopdi / qarzdan tushdi
    ru: вернул / вернула / отдал долг / отдала долг / погасил / погасила / выплатил
    en: repaid / paid back / returned the money / settled the debt / paid off
  Extract: counterparty (the other person's name), amount (whole, expanded; null if not said),
  debt_direction, repay_all, date.
  debt_direction inference:
    • "<name> qaytardi/to'ladi", "<name> вернул", "<name> repaid" (the OTHER person returns to me)
      → debt_direction = "given" (it pays down money I had LENT).
    • "<name>ga qaytardim/to'ladim", "вернул <name>у", "I paid <name> back"
      (I return to the other person) → debt_direction = "taken" (pays down money I had BORROWED).
    • If unclear → debt_direction = null.
  repay_all = true ONLY for "hammasini/to'liq/полностью/in full"; then amount may be null.
  reply_text: a short localized "saved" acknowledgement.
  DO NOT use repay_debt for a brand-new loan ("Sarvarga 2 mln berdim/qarz berdim" = log_debt),
  nor for a normal sale/income ("Sarvar 2 mln to'ladi tovarga" without debt context = log_income).
  When in doubt between log_income and repay_debt, prefer the existing behavior (do NOT
  classify as repay_debt unless a clear repayment keyword is present).
```

## New service — `src/lib/services/debts.ts`
```ts
export interface OpenDebtLite {
  id: string;
  counterparty: string;
  direction: DebtDirection;
  remaining: bigint;
}

/** All OPEN debts for a user, each with its remaining (amountUzs − active payments), remaining>0. */
export async function listOpenDebtsWithRemaining(userId: string): Promise<OpenDebtLite[]> {
  const prisma = db as import("@prisma/client").PrismaClient;
  const debts = await prisma.debt.findMany({
    where: { userId, status: DebtStatus.open, deletedAt: null },
    select: {
      id: true, counterparty: true, direction: true, amountUzs: true,
      payments: { where: { deletedAt: null }, select: { amountUzs: true } },
    },
    orderBy: { occurredAt: "desc" },
  });
  return debts
    .map((d) => {
      const paid = d.payments.reduce((s, p) => s + (p.amountUzs as bigint), 0n);
      const remaining = (d.amountUzs as bigint) - paid;
      return { id: d.id, counterparty: d.counterparty, direction: d.direction, remaining };
    })
    .filter((d) => d.remaining > 0n);
}
```

## New pure matcher — `src/lib/services/debtMatch.ts`
```ts
import type { DebtDirection } from "@prisma/client";

export interface MatchableDebt {
  id: string;
  counterparty: string;
  direction: DebtDirection; // "given" | "taken"
  remaining: bigint;
}

export interface DebtMatchResult {
  status: "none" | "one" | "many";
  matches: MatchableDebt[];
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Match open debts for a repayment by counterparty (+ optional direction).
 * Strategy: filter by direction (if given) → exact normalized name; if none, substring either-way.
 * Only debts with remaining>0 are considered (caller already filters, but be defensive).
 */
export function matchOpenDebts(
  open: MatchableDebt[],
  counterparty: string,
  direction: DebtDirection | null
): DebtMatchResult {
  const pool = open
    .filter((d) => d.remaining > 0n)
    .filter((d) => (direction ? d.direction === direction : true));
  const q = norm(counterparty);
  if (!q) return { status: "none", matches: [] };

  let hits = pool.filter((d) => norm(d.counterparty) === q);
  if (hits.length === 0) {
    hits = pool.filter((d) => {
      const n = norm(d.counterparty);
      return n.includes(q) || q.includes(n);
    });
  }
  if (hits.length === 0) return { status: "none", matches: [] };
  if (hits.length === 1) return { status: "one", matches: hits };
  return { status: "many", matches: hits };
}
```

## Bot dispatch — `src/lib/telegram/bot.ts` (add right AFTER the log_debt block, ~845)
Pseudocode (write real code, inline uz/ru/en messages in the log_debt style; import the new
service fns + `addDebtPayment` + `getDebtWithPayments`):
```
if (intent.intent === "repay_debt") {
  const counterparty = intent.counterparty?.trim() || null;
  const direction = intent.debt_direction ?? null;        // "given" | "taken" | null
  const repayAll = (intent as any).repay_all === true;
  const amount = intent.amount;                            // number | null
  const dateStr = intent.date ?? "today";

  if (!counterparty) { /* ask: "Kim qaytardi? To'liq yozing: 'Sarvar 2 mln qaytardi'" (force_reply) */ return; }
  if (!repayAll && (!amount || amount <= 0)) { /* ask amount: "Qancha qaytarildi? Masalan: 'Sarvar 2 mln qaytardi' yoki 'hammasini'." */ return; }

  const open = await listOpenDebtsWithRemaining(user.id);
  const m = matchOpenDebts(open, counterparty, direction);

  if (m.status === "none") {
    /* reply: no open debt found for <counterparty>; hint to check /debts or restate.
       If open.length>0, optionally list the open counterparties to help. */
    return;
  }

  if (m.status === "many") {
    await upsertPendingAction(user.id, {
      intent: "repay_pick",
      draft: { amount: amount ?? null, repayAll, dateStr },
      question: "",
    });
    /* reply with one button per match:
       text = `${d.counterparty} · ${formatAmount(d.remaining, lang)} ${given/taken label}`
       callback_data = `rp:${d.id}`   // cuid → well under 64 bytes
       in rows of 1. Prompt: "Qaysi qarz? / Какой долг? / Which debt?" */
    return;
  }

  // exactly one
  const d = m.matches[0];
  await applyRepayment(ctx, user, lang, d.id, d.remaining, amount, repayAll, dateStr);
  return;
}
```
Add a small helper used by BOTH the one-match path and the `rp:` callback:
```
async function applyRepayment(ctx, user, lang, debtId, remainingBefore, amount, repayAll, dateStr) {
  const pay = repayAll ? remainingBefore
            : (BigInt(amount) > remainingBefore ? remainingBefore : BigInt(amount));
  if (pay <= 0n) { /* "nothing to pay" message */ return; }
  await addDebtPayment({ debtId, userId: user.id, amountUzs: pay, occurredAt: dateStringToUtc(dateStr), note: null });
  const remainingAfter = remainingBefore - pay;
  const capped = !repayAll && amount != null && BigInt(amount) > remainingBefore;
  // fetch the debt for counterparty name (or pass it through)
  // message:
  //   if remainingAfter <= 0n: "✅ Qarz to'liq yopildi: <counterparty> · <pay>"
  //   else: "✅ To'lov yozildi: <pay>. <counterparty> — qoldiq: <remainingAfter>"
  //   if capped: append " (so'ralgan summa qoldiqdan ko'p edi — qoldiq to'liq yopildi)"
  // attach dashboardReplyOptions(user.id) rows like log_debt does, if convenient.
}
```
NOTE on the `rp:` callback (place near other debt callbacks ~2150): load the `repay_pick`
pending, read {amount, repayAll, dateStr}; fetch fresh remaining via `getDebtWithPayments(debtId,user.id)`
(guards ownership; null → "not found/expired"); call the SAME `applyRepayment`; then
`clearPendingAction(user.id)` and answer the callback. Wrap addDebtPayment in try/catch for
`EXCEEDS_REMAINING`/`AMOUNT_INVALID` (shouldn't happen due to capping, but be safe → friendly msg).

Direction labels for the picker (inline): given = uz "bergan/qaytishi kerak" → keep short, e.g.
uz given "menga qarzdor", taken "men qarzdorman"; ru "мне должен" / "я должен"; en "owes me" / "I owe".

## Required tests
- `tests/debt-match.test.ts` (pure matcher):
  - exact normalized name (case/space-insensitive) → one.
  - no match → none.
  - substring fuzzy ("Sarvar" matches stored "Sarvarbek", and vice-versa) → one.
  - two open debts same name+direction → many.
  - direction filter: same name in both directions, direction="given" → only the given one.
  - remaining<=0 excluded.
  - empty counterparty → none.
- `tests/brain-schema.test.ts` add `describe("RecordIntentSchema — repay_debt")`:
  - parseOk: intent repay_debt + counterparty + amount + debt_direction="given" + repay_all default false.
  - parseOk: repay_all true with amount null.
  - parseOk: debt_direction omitted (null/undefined ok).

## Acceptance criteria
- Schema accepts `repay_debt` + `repay_all`; existing intents unaffected (all current tests pass).
- Matcher unit tests pass (0/1/many, direction filter, fuzzy, remaining filter).
- Dispatch: 1 match applies a capped payment and replies settled/partial correctly; many → picker
  buttons → `rp:` applies to the chosen debt; none → clear "no open debt" reply.
- No DB schema change. No regression to log_debt / log_income / log_expense dispatch.
- typecheck + test + build all green.

## Gate commands (PowerShell, Node on PATH)
- `$env:Path = "C:\Program Files\nodejs;" + $env:Path`
- `npm run typecheck`
- `npm test`
- `npm run build`

## Report back
Files changed (one line each) + how you wired direction inference + the exact callback_data
format + gate results + any deviation. NOTE clearly: live Telegram classification is NOT verified
here (needs the real bot) — that is expected; just make the deterministic parts correct + tested.
