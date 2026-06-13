# PulTrack — Ish holati (HANDOFF board)

> Jonli holat taxtasi. Har sessiya quyidagi ⚡ STATUS blokidan boshlanadi.
> Reja: `C:\Users\localhost\.claude\plans\c-users-localhost-desktop-paste-this-md-iridescent-diffie.md`.
> Specs: `docs/tasks/NNN-*.md`.

## ⚡ STATUS (oxirgi yangilangan: 2026-06-13, Opus)
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
- **Active:** Phase 1 committed → next is Phase 2 (`docs/tasks/002`): voice+query+report+correction+custom cats.
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
