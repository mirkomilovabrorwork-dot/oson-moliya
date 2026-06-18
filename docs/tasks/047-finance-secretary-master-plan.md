# Task 047 — Bot = finance secretary (smart-hybrid Q&A). MASTER PLAN

## North star
The bot answers a businessman's finance questions like a smart secretary: **broad** (almost any
phrasing), **error-free** (numbers always from the DB, never the LLM), **cheap**, **fast**.

## Architecture (the "smart hybrid")
1. **AI understands → DB computes → AI phrases.** The brain classifies the question into an intent +
   a structured query (it already does this). Deterministic services compute EXACT numbers. A thin
   phrasing layer turns the computed numbers into a natural secretary sentence — **but the number is
   guaranteed by code** (the phraser must echo the exact pre-formatted figure; if it doesn't, we fall
   back to a template). The AI NEVER does arithmetic over raw data.
2. **Additive & low-regression.** New capabilities are ADDED to the existing query schema / a new
   `account_query` intent; existing intents' rules are untouched. Conservative, like task 046.
3. **Cost/speed:** one classify call (cached) + DB + one small phrasing call (Haiku, ~40 out tokens,
   cached prefix) ≈ still ~hundredths of a tiyin, ~1s. Phrasing is a knob (falls back to template on
   error/timeout, so it never blocks or breaks).

## Current state (from exploration — facts)
- Brain: ONE forced `record_intent` tool call; `finance_query` carries a `query` object
  (`metric: sum|count|avg|net|breakdown|report`, `period`, `type`, `category`, `groupBy`); replies are
  TEMPLATED in `analytics.ts` (numbers DB-computed, zero hallucination). `debt_query` answers totals +
  open list (DB-computed). Model = `claude-haiku-4-5`, prompt caching ON.
- **REAL BUG:** `groupBy: "day"|"month"` is in the schema + prompt but `runAggregation` IGNORES it →
  silently returns a flat total (wrong answer). Must fix.
- Accounts: `src/lib/services/accounts.ts` computes per-account balance = `initialBalanceUzs + income −
  expense` (transactions linked to the account). No bot query exposes this today.
- Debts: `listOpenDebtsWithRemaining` + pure `matchOpenDebts` already exist (task 046) — REUSE them.

## Scope (FULL — user chose "hammasini")
A. **Cash-on-hand / account balances** — "qancha pulim bor?", "kassada qancha?", "[hisob]da qancha?"
B. **Comparisons** — "bu oy o'tgan oyga nisbatan?", + FIX day/month groupBy (trends by day/month)
C. **Biggest / top-N** — "eng katta xarajatim?", "top-5 kategoriya", biggest income
D. **Per-counterparty debt** — "Sarvar menga qancha qarzdor?", "Akmalga qancha qarzim?"
E. **Natural secretary phrasing** — applies to ALL answers (number guaranteed by code)
F. **Graceful unknown** — if a question can't be mapped, say what the bot CAN answer (never guess wrong)

## Decomposition + agent orchestration
Contracts below let each builder work against an INTERFACE, so the compute services are independent of
the brain schema (the mapping happens only in bot.ts integration). One writer per file.

### WAVE 1 — parallel (5 agents, distinct files, NO build, only their own unit tests + typecheck)
- **T1 `src/lib/services/analytics.ts`** (scope B + C compute):
  - Fix `runAggregation` to honor `groupBy:"day"` and `"month"` (bucket sums by Tashkent day/month) →
    return `{ buckets: {label,income,expense,net}[], text }`.
  - Add `compareToPrevious` support: a pure `computeDelta(current: bigint, previous: bigint): {abs:bigint, pct:number|null}` (pct null when previous=0) + a `compareSpend(userId,{type,period})` that runs the metric for the period AND its previous comparable period (this_month→last_month, this_week→prev 7d window, today→yesterday, this_year→last_year) → `{current,previous,delta,text}`.
  - Add `topTransactions(userId,{type,period,limit=5})` (limit cap 10) → N largest tx `{amountUzs,category,note,occurredAt}[]`.
  - Add optional `limit` to the breakdown path (top-N categories; default keep all, report stays top-3 unless limit given).
  - UNIT TESTS (`tests/analytics-extra.test.ts`): `computeDelta` (positive/negative/zero-prev), and the day/month bucketing on a small fixture if extractable as a pure helper; otherwise test computeDelta + any pure formatter.
- **T2 `src/lib/services/accounts.ts`** (scope A compute):
  - `getCashOnHand(userId): Promise<bigint>` = sum of all account balances (reuse the existing per-account balance calc; do NOT duplicate the formula — call the existing list/balance function).
  - `getAccountBalances(userId): Promise<{id,name,type,balance:bigint}[]>`.
  - Pure `matchAccountByName(accounts:{id,name}[], name:string): {status:"none"|"one"|"many", matches}` (normalized exact→substring, like `matchOpenDebts`).
  - UNIT TESTS (`tests/account-match.test.ts`): exact/substring/none/many/empty.
- **T3 `src/lib/services/debts.ts`** (scope D compute):
  - `getCounterpartyDebt(userId, counterparty): Promise<{ matches:{id,direction,remaining:bigint,counterparty}[], givenRemaining:bigint, takenRemaining:bigint }>` — use `listOpenDebtsWithRemaining` + the existing pure `matchOpenDebts` (from `debtMatch.ts`) with direction=null; sum per direction.
  - UNIT TEST (`tests/counterparty-debt.test.ts`): pure summation helper if extractable (sum given vs taken from a fixture list).
- **T4 `src/lib/claude/answer.ts`** (NEW, scope E):
  - `phraseAnswer({ question, lang, headline, numbers, detail? }): Promise<string|null>` — calls Haiku
    (reuse `client.ts` + `env.CLAUDE_MODEL`) with a SMALL cached static instruction ("friendly Uzbek/RU/EN
    finance assistant; reply in ONE short sentence; use the given figures VERBATIM; never invent numbers")
    + dynamic `{question, headline, numbers, detail}`. `max_tokens` ~120.
  - SAFETY: pure `containsAllNumbers(text:string, numbers:string[]):boolean` — returns true only if every
    `numbers[i]` substring is present. `phraseAnswer` returns `null` if the model output fails the check
    OR the call throws/times out (caller falls back to a template). Cap latency with a timeout.
  - UNIT TESTS (`tests/answer-guard.test.ts`): `containsAllNumbers` true/false/partial. (No live API in tests.)
- **T5 `src/lib/claude/tools.ts` + `src/lib/claude/prompts.ts`** (schema + rules for A–D, F):
  - tools.ts: add metric `"top"` to the `query.metric` enum (Zod + tool input_schema); add optional
    `limit:int` and `compareToPrevious:boolean` (default false) to the query object (Zod + tool schema);
    add a new intent `"account_query"` to BOTH enums; add `account_name:string|null` field (Zod + tool schema).
    Keep `groupBy day/month` as-is (already present). Keep everything ADDITIVE + optional.
  - prompts.ts (static/cacheable prefix, near existing finance_query rules — ADD, do not modify existing):
    rules for account_query (qancha pulim/naqd bor, kassada/[hisob]da qancha → account_name), finance_query
    `compareToPrevious` (o'tgan oyga/haftaga nisbatan), `metric:"top"` + `limit` (eng katta, top-5), groupBy
    day/month (kunlar/oylar bo'yicha), and debt_query WITH counterparty ("Sarvar qancha qarzdor" → debt_query
    + counterparty=Sarvar). Add a disambiguation note: account balance (state) vs finance_query (flow).
  - brain.ts: new query fields are OPTIONAL so the 3 fallback objects need NO change; if TS complains, add the
    minimal default. Do NOT restructure brain.ts.
  - SCHEMA TESTS (`tests/brain-schema.test.ts`, ADD a describe): account_query parses (with/without account_name);
    finance_query with metric "top"+limit; finance_query compareToPrevious true; debt_query with counterparty.

### WAVE 2 — serial (1 agent, `src/lib/telegram/bot.ts` only; depends on Wave 1)
- **T6 bot.ts dispatch integration:**
  - `account_query` handler: resolve cash-on-hand (no account_name) OR a specific account
    (matchAccountByName → none/one/many; many → ask which, reuse a simple picker or list). DB numbers only.
  - finance_query: honor `metric:"top"` (→ topTransactions), `compareToPrevious` (→ compareSpend),
    `groupBy day/month` (→ bucketed text), `limit` (top-N breakdown).
  - debt_query: if `counterparty` present → `getCounterpartyDebt` → per-person answer.
  - Wrap EVERY Q&A reply through `phraseAnswer(...)`; on `null` fall back to the existing/template text
    (so numbers are always correct). Keep logging/confirmation replies UNCHANGED.
  - Graceful unknown: if finance_query/account_query can't build a meaningful result, reply with a short
    capability hint ("Men shularni ayta olaman: bu oy chiqim, qancha pulim bor, eng katta xarajat, ...").
  - Inline uz/ru/en for any new fixed strings (match existing bot style).

### WAVE 3 — me (Opus)
- Review every diff vs contracts; run FULL gates (`typecheck` + `test` + `build`) myself; fix integration
  issues; commit (one or a few coherent commits); update STATE.md.

## Testing
- Pure logic unit-tested (computeDelta, matchAccountByName, containsAllNumbers, counterparty sums, schema).
- Live LLM classification + phrasing quality is NOT unit-testable → verified in the LIVE bot test
  (combined with task 046) by the user before going live.

## Deploy / test plan (combined with the staged 046)
- This is a BOT-BRAIN change → like 046, it needs the user's LIVE bot test before going live.
- Build all of 047 + keep 046 → gates green → ONE live test session (user asks questions + debt-repay on
  @oson_moliya_bot) → then deploy. NO prod DB change (047 adds no columns). Rollback = redeploy `32476d8`.

## Hard rules for all agents
- Edit/Write UTF-8 no BOM; match surrounding style. Additive only; no schema/DB change. Do NOT touch git,
  STATE.md, or files outside your assigned set. Wave-1: do NOT run `npm run build` or `prisma` (avoid
  clashing in the shared worktree) — only your own `npx vitest run <file>` + `npm run typecheck`.
- Money = BigInt whole so'm; format via the existing `formatAmount`/`formatSom` helpers (find + reuse).
- Tashkent (UTC+5) for periods — reuse existing date helpers in `src/lib/dates.ts` / analytics.
