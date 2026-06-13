# TASK 004 — Phase 4: Deploy hardening, docs, demo, submission artifacts

**Prereq:** Phases 1–3 merged & gates green. Read `CLAUDE.md`, `docs/STATE.md`. This phase produces the
gradable submission. NOTE: actual deploy, webhook registration, and recording are **user-gated /
main-session actions** (external + secrets) — the agent prepares everything; the main session (Opus) runs
the deploy WITH the user. Agent must NOT deploy or write real secrets.

## 1. Build/deploy readiness (agent does the code; main session deploys)
- `package.json`: `"build": "prisma generate && next build"` and `"postinstall": "prisma generate"` so
  Vercel produces a fresh Prisma client.
- `vercel.json` (if needed): set `maxDuration` for `/api/telegram` (Vercel limit on Hobby; voice path).
- Confirm all env vars used are listed in `.env.example` and documented; nothing reads `process.env`
  outside `src/lib/env.ts`.
- Confirm `.gitignore` covers `.env*` (except `.env.example`) — no secret can be committed.
- Idempotency: optional in-memory recent-`update_id` guard on warm instances; ensure errors are logged
  and the webhook still returns 200.

## 2. README.md (English, professional)
Sections: what PulTrack is (1 paragraph) · architecture diagram/description (one app: dashboard + API +
Telegram webhook over Neon) · tech stack · local setup (incl. the PowerShell `$env:Path` note, `.env.local`
from `.env.example`, `prisma migrate dev`, `npm run dev`, `npm run bot:dev` for local polling) · how to
register the webhook for prod (`npm run set-webhook`) · deploy steps (Vercel + Neon env) · the live bot
username + dashboard URL (filled at deploy) · feature list · known limitations.

## 3. Submission docs (`docs/`)
- `product-brief.md` — 3–5 sentences: who it's for, the problem, what it does, the differentiator
  (talk to a bot in uz/ru/en by text or voice; it understands and a real dashboard shows everything).
- `three-more-days.md` — teams/multi-user workspaces, recurring transactions, receipt-photo OCR,
  PDF/Excel export, scheduled budget digests (Vercel Cron), full cross-language category mapping,
  auto-fallback to OpenAI STT on low Whisper confidence.
- `demo-script.md` — exact recording steps: send a voice message ("logistikaga 500 ming chiqim") → bot
  transcribes + confirms → tap Dashboard → transaction visible on Overview + Transactions → show a chart →
  set a budget → exceed it via the bot → show the warning → switch UI language. Include 2–3 realistic
  sample messages in uz/ru/en.

## 4. Final verification checklist (run with the user)
- Live: deploy to Vercel; set Neon + Anthropic + Groq + Telegram envs; `npm run set-webhook` to the prod
  URL; send text + voice in Telegram; open dashboard via the bot button; confirm data, charts, budget
  alert, language switch all work end-to-end.
- Gates green on the deployed commit.

## Acceptance criteria
1. `npm run typecheck` + `npm test` + `npm run build` green.
2. README + product-brief + three-more-days + demo-script complete and accurate.
3. Build/deploy config correct (prisma generate in build, env documented, no secrets committed).
4. No deploy or real secrets performed by the agent (main session + user do the live steps).

## Final report
Files changed; gate results; a precise, ordered deploy runbook for the main session to execute with the user.
