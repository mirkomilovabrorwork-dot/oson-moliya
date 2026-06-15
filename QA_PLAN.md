# QA Plan — PulTrack / Oson Moliya

## Project
- **Name:** PulTrack ("Oson Moliya") — Telegram finance bot + Next.js dashboard for Uzbek SMBs.
- **Platform:** Web + Telegram Mini App + Telegram bot. **Evidence:** `package.json` → `next@16.2.9`, `react@19`, `grammy@1.43` (bot), `recharts` (charts), `@prisma/adapter-neon` (Neon Postgres); no `android/` directory; Next.js App Router under `src/app`. Single app serves dashboard + API + `/api/telegram` webhook.
- **Tooling:** Claude Preview MCP for the web dashboard (will ATTEMPT a local `next dev` run + a locally-minted dev session). Static code-audit where runtime is unreachable. No Playwright (would need gate G3).
- **Run / build / test commands:**
  - dev: `next dev` (port 3000)
  - build: `prisma generate && next build`
  - test: `vitest run` (104 tests, 8 suites)
  - typecheck: `tsc --noEmit`
  - lint: `eslint`
  - (deploy is `npx vercel --prod --yes` — NOT used during QA)
- **Hardening tools detected:** ESLint ✅ (`eslint` + `eslint-config-next`) · Vitest ✅ (104 tests) · CI ❌ (no `.github/workflows`) · Error tracking ❌ (no Sentry/Crashlytics) · Lighthouse ❌ · a11y checker ❌ · `npm audit` available ✅ · Bundle analyzer ❌.

## Auth / dev-bypass (KEY)
- **No dev-auth bypass exists.** Searched `src` for `ALLOW_INSECURE_DEV` / `SKIP_AUTH` / `DEV_MODE` → **no matches**; `.env.example` has no such flag. Dashboard auth = magic-link issued by the bot → HMAC session cookie (`AUTH_SECRET`).
- Consequence: authenticated dashboard pages CANNOT be opened headlessly out-of-the-box. Mitigation to attempt in Steps 2–3: run `next dev` locally and MINT a session cookie for a seeded test user using the app's own token logic + the local `.env` `AUTH_SECRET` (DEV ONLY, never against prod). If `next dev` / Preview MCP cannot run here, authed screens are marked `Unverified — needs real auth`.

## COVERAGE PRE-FLIGHT (honest, set BEFORE the run)
- **CAN test:** build health (typecheck / test / build); full static code-audit of every flow + gap; the unauthenticated `/login` page screenshot; ATTEMPT authed dashboard screens via local dev + minted dev session.
- **WILL be `Unverified` (with reason):**
  - **Bot AI flows** (text / voice / receipt-photo logging, queries, corrections) → driving the live bot spends real Anthropic + ElevenLabs API credit and writes to the production Neon DB; **unsafe per QA rules (no real charges)** → code-audit only.
  - **Real-device-only WebView behaviour** (Telegram host theme override, Excel `/hisobot` file download, device back button) → needs a real phone.
  - **Live API down / rate-limited** (CBU rates, Claude) → environmental, noted if hit.
- Never marked "pass" without evidence (a screenshot read via Read, a real command output, or cited code).

## Status
Step 0 ✅ · Step 1 ✅ · Step 2 ✅ · Step 3 ✅ (0 ❌, 0 Critical/High; 6 Low; 4 auditor false-positives rejected) · Step 4 ⏭️ (skipped per user — fixes decided together) · Step 5 ⏭️ (skipped per user)

## The 6 steps (user scope = 1→3 only, read-only)
- Step 1 — Map flows + gaps → QA_FLOWS.md
- Step 2 — Smoke gate → QA_SMOKE.md
- Step 3 — Full QA execution → QA_REPORT.md  ← **stop here, present to user; fixes decided together**
- Step 4 — Fix all failures, re-verify → SKIPPED this run
- Step 5 — Production hardening → SKIPPED this run

## Non-disruptive rules
- Headless / background only — no GUI windows on the user's desktop.
- Screenshots ≤ 1800 px height; read via Read tool only; batch parallel reads.
- Web: select by data-testid / aria-label / visible text — never pixel coordinates.
- Test/sandbox data only. No real payments, no real messages to users, no production deploys, no `git push`.

## Hand-off contract
Each step: (1) reads QA_PLAN.md first and confirms it is the next step; (2) does its work; (3) writes its output file; (4) updates the Status line above. Files are the source of truth — not chat.
