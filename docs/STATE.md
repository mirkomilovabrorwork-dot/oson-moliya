# PulTrack — Ish holati (HANDOFF board)

> Jonli holat taxtasi. Har sessiya quyidagi ⚡ STATUS blokidan boshlanadi.
> Reja: `C:\Users\localhost\.claude\plans\c-users-localhost-desktop-paste-this-md-iridescent-diffie.md`.
> Specs: `docs/tasks/NNN-*.md`.

## ⚡ STATUS (oxirgi yangilangan: 2026-06-13, Sonnet — task 010 done)
- **Loyiha:** PulTrack — IELTS emas! data365 vibecoder imtihoni, Task 01 (Business Finance Manager).
  Telegram bot (matn+ovoz) + ko'p sahifali veb-dashboard, bitta Neon Postgres bazasi. Muddat ~20 soat.
- **Stack:** Next.js 16 (App Router) + TS + Tailwind v4 + Recharts · Prisma 6 + Neon Postgres ·
  Claude (miya, tool-use) · Groq Whisper (ovoz, almashtiriladigan) · Vercel deploy.
- **Qarorlar:** auth=botdan magic-link · +1 feature=oylik byudjet ogohlantirishi · sayt 3 til (uz/ru/en) ·
  Prisma adapter-neon + pooled URL · hand-rolled i18n · budget alert inline (cronsiz).
- **Done:** Phase 0 (scaffold + deps + Prisma 6 pin). Plan audit → `docs/PLAN_REVIEW.md`. Specs 001–004.
  Docs (README/brief/3-more-days/demo) drafted + reviewed. **Phase 1 DONE + Opus-reviewed (2026-06-13):**
  Sonnet built foundation+bot(text)+auth+dashboard skeleton; gates re-run green (typecheck 0, test 18/18,
  build OK). Live-tested: Neon DB write/read OK; Claude brain excellent (uz/ru/en, compound amounts,
  cross-lang category "аренда"→ijara, finance_query). **Opus fixes applied:** db.ts production connection
  leak (now cached singleton in all envs); proxy.ts replaces middleware.ts (deleted prebuild/postbuild
  hack); deleted duplicate-`/` notFound hack; set-webhook dotenv dep (installed dotenv, single `.env`);
  added scripts/bot-dev.ts (local polling); build now `prisma generate && next build` + postinstall.
  Migration `init` applied to Neon. `.env` has real ANTHROPIC/TELEGRAM/Neon keys (gitignored).
- **Phase 2+3+integration DONE (2026-06-13, parallel Sonnet agents + Opus integration):** P2 backend
  (voice STT Groq, finance_query+report, correct/delete, custom cats; clarify-loop type bug FIXED, dead code removed),
  P3 UI (Analytics+3 charts, Categories, Budgets+bars, Onboarding, full uz/ru/en, DESIGN.md), + Opus added the
  missing API routes (analytics/categories/budgets — UI called them, didn't exist). Gates re-run green:
  typecheck 0, test 59/59, build OK (all routes present). Commits 8fc9b58→d5ec4cd→f3e6425→c280757.
  ⚠️ The "worktree isolation" did NOT apply to this external repo — both agents edited master directly
  (disjoint files, so the merge was effectively the working tree; integrated fine).
- **Live-test fixes (Opus, after real Telegram + browser testing):** (a) Telegram rejects http://localhost
  inline-button URLs → `dashboardReplyOptions` sends the link as TEXT locally, button in prod; (b) added
  `bot.catch` (one error no longer crashes the bot); (c) rebranded web + bot to **"Oson Moliya"** (PulTrack
  was a stray; the only remaining "PulTrack" is the internal project/repo name); (d) fixed dashboard "open bot"
  links from a stray @PulTrackBot → **@oson_moliya_bot** (real bot, token verified); (e) brain now defaults to
  Uzbek for ambiguous input + no longer leaks the internal brand name in replies; (f) added bot `/login`+`/dashboard`
  commands (the login page hints `/login`); (g) magic-link TTL 10→30min. Commits 540759a→6364b84→1e80104.
- **Task 010 DONE (2026-06-13, commit 2393ac3):** Kissa-clean UI polish: BottomNav (mobile bottom-tab, 4 tabs,
  brand active, safe-area), TopNav mobile-only cleanup, --radius 12px, CategoriesClient icon-tile rows +
  segmented Xarajat/Daromad toggle, TransactionsClient rounded search + chip filters + DAROMAD/XARAJAT
  summary cards. Gates green: typecheck 0 · test 59/59 · build OK.
- **DESIGN v3 DONE (2026-06-13, commits 95b7d04+ba44adb):** research-synthesized professional anti-AI-slop
  system (`docs/DESIGN.md` v3): rationed terracotta accent, warm neutral ramp + token pairs, re-tuned dark,
  shared focus ring, borders-over-shadows, Inter 440/540/620, tabular money. Migrated all components off old
  `--color-*` tokens. Gates green; Opus smoke-tested all 4 pages → 200 (no 500).
- **PROGRESS:** **Task 01 (assessment) core = ~100% built + working locally + gates green + live-tested.**
  Remaining REQUIRED for submission: (1) DEPLOY — push to GitHub + Vercel + register webhook (`docs/DEPLOY.md`),
  (2) user records the screen demo. EXTRA scope (user-added, Kissa-parity, NOT required by Task 01): theme+v3 DONE;
  Debts(008)/Accounts+More(009)/bot-reply(011) NOT built. **Recommendation: DEPLOY first (lock a working
  submission), then add extras if time.**
- **Active:** Awaiting user decision — deploy-first vs build Debts/Accounts first. App live locally.
- **Bot identity:** @oson_moliya_bot (name "Moliyachi"), brand shown to users = "Oson Moliya". Demo data seed:
  `scripts/_seed.ts` (telegramId 999000001) → prints a magic-link to view a populated dashboard.
- **Phase 2 hardening notes (Opus found in review):** (1) bot.ts clarify-loop hardcodes draft intent
  `log_income` + derives txType from the new message, not the draft → a clarified EXPENSE could log as
  INCOME; preserve draft intent/type on resume. (2) Dead code `getTashkentDateString` unused in bot.ts.
  (3) Brain reply_text number formatting inconsistent (server formatConfirmation is correct; fine for logs,
  but Phase-2 query answers must be server-formatted with spaces). (4) Full visual UI/UX audit (DESIGN.md
  + screenshots) deferred to Phase 3 where the real UI lands; Phase-1 pages are functional-interim.
- **Account order (user-gated):** (1) Neon DATABASE_URL — first, (2) ANTHROPIC_API_KEY + TELEGRAM_BOT_TOKEN
  (user has; → `.env.local`, gitignored), (3) GitHub + Vercel — needed to test the LIVE bot (end P1/P2),
  (4) GROQ_API_KEY — Phase 2 (voice). Deploy/money/external = ask user first.
- **Next:** Phase 1 (core) → Phase 2 (voice+query+correction) → Phase 3 (analytics+budget+i18n) → Phase 4 (docs+deploy+demo).

## Build phases
- P0 scaffold ✅ · P1 core (bot text→log+confirm, magic-link auth, Overview+Transactions) ·
  P2 voice+finance query+correction+custom categories · P3 analytics charts+categories+onboarding+budget alerts+i18n ·
  P4 README+brief+3-more-days+deploy+demo recording.

## Conventions
- UTF-8 faqat Edit/Write orqali. Additive DB. Sonnet git'ga tegmaydi / commit qilmaydi / secret yozmaydi.
- Node PATH: `$env:Path = "C:\Program Files\nodejs;" + $env:Path` (PowerShell tool, Bash emas).
- Gate: `npm run typecheck` + `npm test` + `npm run build` yashil bo'lmasa "tayyor" yo'q.
- Har task = 1 commit + STATE yangilash (commit'ni Opus qiladi).
