# Task 056 — Agentic-engineering hardening (UMBRELLA PLAN)

> Status: **PLAN — awaiting user "boshla".** No code until approved.
> Origin: user's call 2026-06-19 ("full agentic engineering bo'lamiz") after the Alex Barady / ENDGAME
> "vibe-coding sinks vs agentic-engineering compounds" infographic. Research synthesis →
> [[reference_agentic_engineering_pillars]] in memory.
> Principle reminder: close the 3 WEAK pillars; do NOT copy a guru wholesale; no busywork.

---

## Verified current state (file:line — what we already HAVE)

We already do ~9/12 pillars. Confirmed by repo recon:
- **Gates ✓** — `package.json`: `typecheck` (tsc --noEmit), `lint` (eslint), `test` (vitest run, 16 files in `tests/`), `build`.
- **Spec-first ✓** — `docs/tasks/NNN-*.md`. **Knowledge hub ✓** — `MEMORY.md` + `docs/STATE.md`. **Subagents/skills/hooks ✓** (global). **Trajectory review ✓** (I read diffs). **Plan/task breakdown ✓**.
- **Brain ✓** — `src/lib/claude/brain.ts` → `runBrain()` (line 30); prompt `src/lib/claude/prompts.ts` → `buildSystemPrompt()` (line 12), already split `staticPrefix` (cached) + `dynamicSuffix`.
- **Repo CLAUDE.md already LEAN** — 23 lines (`@AGENTS.md`); AGENTS.md 5 lines. No `.claude/rules/` needed.

The 3 weak pillars (gaps), confirmed:
1. **Verification depth** — `tests/brain-schema.test.ts` (757 lines) tests Zod schema ONLY, no real classification accuracy. No measured accuracy on Uzbek.
2. **Agentic CI/CD + monitoring** — `.github/` = **NONE**. Webhook errors (`src/app/api/telegram/route.ts:11-37`) → `console.error` → 200; **no owner alert**. `FEEDBACK_CHAT_ID = 8582045913` (`src/lib/telegram/bot.ts:39`) exists but only forwards `/feedback`.
3. **Sandboxing/isolation** — parallel agents share one worktree + a one-writer-per-file lock (works; undocumented decision).

---

## The plan — 4 steps, recommended order A → B → C → D

Reasoning for order: A+B are fully in our control, low-risk, and protect everything downstream (enforce gates,
surface failures) → do first. C (highest value) needs the user's live-test + real messages → build in parallel
with the user's testing. D is a quick documented decision → last.

### Step A — Pipeline gates + guardrail hooks  · [me] · effort M · risk LOW
**Outcome:** every push is gate-checked by a pipeline (not just by me), and dangerous/irreversible commands are
physically blocked by a hook (guardrail = a hook that BLOCKS, not prose that asks).
- **FIRST sub-task — audit test DB deps:** do `tests/**` need `DATABASE_URL` (accounts/debts/budget/analytics
  look DB-backed)? Decide CI shape accordingly (a Postgres service in CI, or split DB tests from pure-unit).
- `.github/workflows/ci.yml` (NEW): on push + PR → `npm ci` → `typecheck && lint && test && build`.
- `package.json`: add `"gate": "npm run typecheck && npm run lint && npm run test && npm run build"` (one command).
- `.claude/settings.json` (NEW): PreToolUse hook blocking irreversible cmds for ALL (force-push, `reset --hard`,
  `git clean`, prod deploy `vercel --prod`, `prisma ... --accept-data-loss`/`migrate deploy`) + writes to `.env*`.
  **I author these myself — no code copied from stranger repos (supply-chain safety).** May use the
  `git-guardrails-claude-code` skill to scaffold correctly.
- **Acceptance:** branch push → CI goes green; a subagent attempting `git push` or writing `.env.local` is blocked;
  `npm run gate` runs all 4 gates.

### Step B — Prod error monitoring (DM owner)  · [me] · effort M · risk LOW
**Outcome:** when prod throws, the owner gets a Telegram DM — we learn before users tell us.
- NEW `src/lib/telegram/notifyOwnerError.ts` → sends to `FEEDBACK_CHAT_ID` via `bot.api.sendMessage`, throttled
  (best-effort dedupe; serverless = no shared memory, accept minor dup), NEVER throws inside a catch.
- Wire into webhook catches (`route.ts:11-37`) + key API route catches.
- **Acceptance:** forced error on a preview → owner receives a DM with route + short error; normal flow sends nothing.

### Step C — Brain accuracy eval harness (verification depth)  · [me] + [you] · effort M · risk LOW
**Outcome:** a measured accuracy % on REAL Uzbek messages → the safety net/gate for any future brain or
cost change ("don't ship if accuracy drops").
- NEW `tests/eval/brain-cases.ts` — labeled cases (message → expected intent/amount/category/direction). Start
  ~30-50 (I draft from known patterns + your real live-test messages) → grow to ~100.
- NEW `scripts/eval-brain.ts` + `package.json` `"eval": "tsx scripts/eval-brain.ts"` — runs `runBrain` over cases,
  prints overall + per-intent accuracy + a miss table (expected vs got). **NOT in the default gate / CI** (it costs
  API money + is non-deterministic).
- **[you]:** live-test the shipped bot (046–053) on @oson_moliya_bot + paste real messages you send → I label them.
- **💵 MONEY FLAG:** building = free; RUNNING `npm run eval` = N Haiku calls (~cents/run). **I ask before running.**
- **Acceptance:** `npm run eval` prints accuracy % + per-intent breakdown + every miss.

### Step D — Sandboxing/isolation decision (documented)  · [me] · effort S · risk NONE
**Outcome:** one written, unambiguous rule so next session doesn't re-debate it.
- Decision (proposed): **KEEP the one-writer-per-file lock** at our scale; adopt Workflow `isolation: "worktree"`
  per agent ONLY for big parallel mechanical file-writes. Document in [[playbook_agent_delegation]] + project guide.
- **Acceptance:** the rule is written down.

---

## What we SKIP (honesty — no busywork)
- Repo CLAUDE.md trimming — already lean (23 lines). Brain prompt restructuring — already cached; don't churn.
- Copying stranger repos' hooks wholesale — supply-chain risk; we author our own minimal hooks.
- `endgame-build/aspects` (versioned context packages) — overkill for one project.
- Auto-memory compiler (coleam00) — we already have working memory + 3 hooks; adding a Python compiler = new
  failure surface. Defer unless manual upkeep becomes painful.
- The €6,500 cohort — no.

## Approval / money gates
- Running the brain eval (~cents/run) → **ask first.** Any prod deploy → **ask first.** Everything else is free.

## Execution protocol (after "boshla")
Per step: write the NNN spec → delegate (Sonnet) or inline if small → I review the diff → I run the gates →
one commit per step → update `docs/STATE.md` → report in simple Uzbek. Steps are independent; order A→B→C→D.
