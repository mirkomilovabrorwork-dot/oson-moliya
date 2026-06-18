# Task 048 — Bot: multiple transactions in ONE message

## Goal
When the user says several finance items in one message — "non oldim 10 ming, taksi 20 ming,
oylik tushdi 5 million" — the bot logs ALL of them at once and replies with ONE combined
confirmation. Today the brain emits ONE action per message, so only the first/none is logged.
(Previously paused by the user; now requested: "bajarib deploy qil uni ham".)

## Principles
- **Reuse, don't reinvent.** Each item must go through the SAME creation path as a single log
  (`finalizeLog`) so it inherits currency conversion, category resolve, default-account, budget
  alerts. Numbers/logic stay identical to single-item.
- **Conservative trigger = no regression.** `log_multiple` fires ONLY when the message clearly has
  **2+ distinct finance items, each with its own amount**. A single item STAYS `log_income`/
  `log_expense`. Never split one purchase into many. (Same low-regression discipline as 046/047.)
- Bot-brain change → needs a live test before trust (combined into this deploy).

## Verified background (file:line)
- Brain post-processing converts a foreign single amount → UZS and injects `_originalAmount` /
  `_originalCurrency`: `src/lib/claude/brain.ts:160-176` (uses `convertToUzs(amount, currency, rates)`
  from `src/lib/currency.ts`; `rates` already fetched there). **The batch must do this PER ITEM.**
- `finalizeLog(ctx, user, prisma, params, lang)`: `src/lib/telegram/bot.ts:94-…`. Params shape
  `FinalizeLogParams` (bot.ts:83-92): `{ amount, txType, category?, dateStr, note?, originalAmount?,
  originalCurrency? }`. `amount` is ALREADY UZS. finalizeLog creates the tx (with conversion-display),
  sets `lastTransactionId` pending, and REPLIES with a confirmation + buttons.
- Single-item dispatch calls finalizeLog at bot.ts:869-877 (the `log_income`/`log_expense` block at 804).
- Schema: `src/lib/claude/tools.ts` (Zod `RecordIntentSchema` + `RECORD_INTENT_TOOL` input_schema;
  intents incl. log_income/expense/debt/repay_debt/account_query/...). Per-item fields mirror the
  existing top-level fields (type, amount, currency, category, date, note).
- Prompt rules: `src/lib/claude/prompts.ts` (static prefix, per-intent rules).
- Schema tests: `tests/brain-schema.test.ts` (`parseOk`/`parseFail`).

## CONTRACT (so the two agents work in parallel)
The brain emits, for a multi-item message:
```
intent.intent = "log_multiple"
intent.items = [
  { type: "income"|"expense", amount: <number, UZS AFTER conversion>, category?: string|null,
    date?: string|null, note?: string|null,
    _originalAmount?: number|null, _originalCurrency?: string|null }   // set by brain when currency≠UZS
  , ...
]
```
- The brain CONVERTS each item's foreign amount → UZS (sets `amount` to UZS, stashes `_originalAmount`
  + `_originalCurrency`). So the BOT handler receives every item already in UZS, exactly like a single log.
- The bot handler loops items and calls `finalizeLog` per item, then sends ONE combined reply.

## AGENT A — schema + prompt + brain conversion (files: tools.ts, prompts.ts, brain.ts, tests/brain-schema.test.ts)
1. tools.ts — add `"log_multiple"` to BOTH the Zod intent enum and the tool input_schema enum.
   Add an `items` field:
   - Zod: `items: z.array(z.object({ type: z.enum(["income","expense"]), amount: z.number().int().positive(), currency: z.enum(["UZS","USD","EUR","RUB"]).default("UZS"), category: z.string().nullable().optional(), date: z.string().nullable().optional(), note: z.string().nullable().optional() })).optional()`
   - tool input_schema.properties.items: `{ type: ["array","null"], description: "...", items: { type:"object", properties:{ type:{enum:["income","expense"]}, amount:{type:"integer"}, currency:{enum:["UZS","USD","EUR","RUB"]}, category:{type:["string","null"]}, date:{type:["string","null"]}, note:{type:["string","null"]} }, required:["type","amount"] } }
2. prompts.ts — ADD a `log_multiple` rule near log_income/log_expense (do NOT modify existing rules):
   - Trigger ONLY when the message has 2+ DISTINCT finance items each with its OWN amount.
   - uz e.g.: "non oldim 10 ming, taksi 20 ming, oylik tushdi 5 million" → log_multiple, items=[{expense,10000,oziq-ovqat},{expense,20000,transport},{income,5000000,oylik}].
   - ru/en examples. Each item: classify income/expense, expand amount, set currency (default UZS),
     map category by keyword (same rules as single), date, note.
   - CRITICAL: a SINGLE item stays log_income/log_expense — do NOT use log_multiple for one item, and
     never split ONE purchase into several items.
3. brain.ts — in the post-processing (mirror the single-item conversion at ~160-176): when
   `intent.intent === "log_multiple"` and `intent.items` is an array, loop each item; if
   `item.currency && item.currency !== "UZS" && item.amount > 0`, `convertToUzs(item.amount,
   item.currency, rates)` → set `item._originalAmount = item.amount`, `item._originalCurrency =
   item.currency`, `item.amount = converted`. Reuse the SAME `rates` already fetched for the single path
   (fetch once, use for all items). If the 3 fallback objects need an `items` default, keep it optional
   (no change needed since optional).
4. tests/brain-schema.test.ts — ADD a `describe("RecordIntentSchema — log_multiple")`: parseOk with a
   2-item array (one income, one expense); each item shape valid; parseOk when items omitted for other
   intents (unaffected). Do not weaken existing tests.

Run ONLY: `npx vitest run tests/brain-schema.test.ts` + `npm run typecheck`. NO build/prisma.

## AGENT B — dispatch handler (file: bot.ts ONLY)
Add a new `if (intent.intent === "log_multiple")` block (place it right BEFORE the `log_income`/
`log_expense` block at ~804 so it's checked first). Logic:
```
const itemsRaw = (intent as Record<string, unknown>).items as Array<Record<string, unknown>> | undefined;
const items = Array.isArray(itemsRaw) ? itemsRaw : [];
// keep only valid items
const valid = items.filter(it => (it.type === "income" || it.type === "expense") && typeof it.amount === "number" && it.amount > 0);
if (valid.length === 0) { /* fallback: reply "tushunmadim, har birini aniqroq yozing" uz/ru/en */ return; }

const captured: string[] = [];
for (const it of valid) {
  const capCtx = { reply: (t: string) => { captured.push(t); return Promise.resolve(undefined as unknown); } };
  await finalizeLog(capCtx, user, prisma, {
    amount: it.amount as number,
    txType: it.type === "income" ? TxType.income : TxType.expense,
    category: (it.category as string | null | undefined) ?? null,
    dateStr: (it.date as string | undefined) ?? "today",
    note: (it.note as string | null | undefined) ?? null,
    originalAmount: (it._originalAmount as number | undefined) ?? null,
    originalCurrency: (it._originalCurrency as string | undefined) ?? null,
  }, lang);
}
// ONE combined reply
const header = lang==="ru"?`✅ Записал ${valid.length} операц.:`:lang==="en"?`✅ Logged ${valid.length} entries:`:`✅ ${valid.length} ta yozuv qo'shildi:`;
const skipped = items.length - valid.length;
const skipNote = skipped>0 ? (lang==="ru"?`\n\n(${skipped} не понял — напишите отдельно)`:lang==="en"?`\n\n(${skipped} unclear — write separately)`:`\n\n(${skipped} tasini tushunmadim — alohida yozing)`) : "";
const dash = await dashboardReplyOptions(user.id);
await ctx.reply(header + "\n\n" + captured.join("\n\n") + skipNote + dash.extraText, { reply_markup: { inline_keyboard: [...dash.dashRows] } });
return;
```
Notes: `finalizeLog`, `dashboardReplyOptions`, `TxType` are already imported in bot.ts. The capturing
ctx collects each item's confirmation text (finalizeLog still creates the tx + sets pending + checks
budget — only its reply is captured, not sent). Do NOT modify finalizeLog. Inline uz/ru/en.

Run: `npm run typecheck` + `npx vitest run` + `npm run build`.

## Files NOT to touch
- finalizeLog itself; the existing log_income/expense/debt/repay/account/finance/debt_query handlers;
  any service; DB schema (NO change). No git, no STATE.md.

## Acceptance criteria
- "non oldim 10 ming, taksi 20 ming, oylik 5 million" → 3 transactions created + ONE combined
  confirmation listing all 3, correct types/amounts/categories.
- A single-item message ("non oldim 10 ming") still logs via log_income/log_expense (NOT log_multiple).
- Foreign currency per item converts correctly (reuses convertToUzs); confirmation shows original.
- Items missing an amount are skipped + counted in the reply; never a 0-amount tx.
- typecheck + test + build green; existing tests still pass.

## Gates (PowerShell, Node on PATH)
`$env:Path = "C:\Program Files\nodejs;" + $env:Path` → `npm run typecheck` · `npm test` · `npm run build`

## Deploy
Combined bot-brain deploy (like 046/047): full HEAD → `vercel --prod` → user live-tests
("non 10 ming, taksi 20 ming, oylik 5 mln") → rollback = redeploy `32476d8` if regressed.
