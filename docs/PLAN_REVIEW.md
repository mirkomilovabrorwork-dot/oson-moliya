# Plan review — critical audit before full execution (Opus, 2026-06-13)

Audited the approved plan + Phase-1 spec against the Task 01 requirements line by line.
Coverage is broadly complete; the following GAPS were found and resolved in the specs.

## Gaps found → resolution
1. **Local bot testing was implicitly blocked on deploy.** A Telegram webhook needs a public
   HTTPS URL, so nothing bot-related could be tested until Vercel was live.
   → **Fix:** add `npm run bot:dev` (grammY **long-polling**) for local dev/testing. Production
   still uses the webhook route. Testing is now decoupled from deploy. (Spec 001 addendum + 002.)
2. **Vercel build would ship a stale/missing Prisma client.** `prisma generate` must run in the
   build pipeline on Vercel.
   → **Fix:** `"build": "prisma generate && next build"` (+ `postinstall: prisma generate`). (Spec 004.)
3. **"Request a report" is a distinct intent in the task**, but the brain only had single-value
   `finance_query`. A user asking "this month's report" should get a rich multi-line summary.
   → **Fix:** add a `report` path (period summary: income, expense, net, top categories). (Spec 002.)
4. **Cross-language category duplication** — "logistika" / "логистика" / "logistics" could create
   three categories for one concept.
   → **Mitigation:** inject the user's existing category names into the prompt and instruct Claude to
   REUSE the closest existing category; canonical lowercased key. Full synonym mapping = "3 more days". (Spec 002.)
5. **Foreign-currency input** ("100 dollar", "$50") could be mis-stored as so'm.
   → **Fix:** detect non-UZS currency mention → clarify ("Iltimos, so'mda kiriting") instead of guessing. (Spec 002.)
6. **First-use onboarding + voice progress** — `/start` should show concrete examples; voice should
   show a "⏳ tinglayapman…" chat action while transcribing (better UX + better demo).
   → **Fix:** `/start` example messages (Spec 001 addendum); voice typing indicator (Spec 002.)
7. **Transactions page requires inline edit & delete + filters + search** (explicit task wording) —
   must not be dropped.
   → **Fix:** API `[id]` PATCH/DELETE in P1; inline edit/delete UI + filters + search in P2/P3. (Specs 002/003.)
8. **Account sequencing** — GitHub + Vercel are needed by the time we test the LIVE bot (end of P1/P2),
   not at P4. Neon + Anthropic + Telegram first; Groq for P2; GitHub+Vercel for first deploy. (STATE updated.)

## Phase-1 addenda to apply at review (small, additive)
- `package.json`: add `"bot:dev": "tsx scripts/bot-dev.ts"` (grammY `bot.start()` long-polling) and
  `scripts/bot-dev.ts`. Build script → `prisma generate && next build`.
- `/start`: greeting + 3 example messages (uz/ru/en aware) + Dashboard button.

## Confirmed solid (no change)
Data model + indexes; magic-link auth; lazy env; BigInt serialization; Asia/Tashkent date math;
webhook secret verification + always-200; force-dynamic dashboard pages; swappable STT; budget-alert
inline design; phased build order. The Phase-1 agent's foundational work stands regardless of these gaps.
