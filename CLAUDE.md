@AGENTS.md

# PulTrack — project guide for Claude

PulTrack = Telegram bot (text + voice) + multi-page web dashboard for Uzbekistan SMB
finance tracking. data365 vibecoder assessment, Task 01. NOT related to EasyWrite.

## Start every session here
1. Read `docs/STATE.md` ⚡ STATUS block — current phase, blockers, next step.
2. Big picture / approved plan: `C:\Users\localhost\.claude\plans\c-users-localhost-desktop-paste-this-md-iridescent-diffie.md`.
3. Task specs: `docs/tasks/NNN-*.md`.

## Hard rules
- Stack: Next.js 16 (App Router) + TS + Tailwind v4 + Recharts · Prisma 6 + Neon Postgres ·
  Anthropic Claude (tool-use) · Groq Whisper (voice) · Vercel.
- Next 16 differs from training data — consult `node_modules/next/dist/docs/01-app/` before writing
  App Router code (async `cookies()`/`headers()`/route `params`, etc.).
- Money stored as `BigInt` whole so'm; serialize `.toString()` in every API response.
- Dates: Asia/Tashkent (UTC+5) for "today/this month"; store `occurredAt` in UTC.
- Telegram webhook: verify `X-Telegram-Bot-Api-Secret-Token`; always return 200 after logging.
- All node/npm/prisma commands via PowerShell with `$env:Path = "C:\Program Files\nodejs;" + $env:Path`.
- Gate before "done": `npm run typecheck` + `npm test` + `npm run build` green.
- Secrets only in `.env.local` (gitignored). Never commit secrets. Subagents do not run git/deploy.
