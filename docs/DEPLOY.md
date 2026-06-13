# PulTrack / Oson Moliya — Deploy runbook (Phase 4)

Goal: put the app live on a public HTTPS URL so the Telegram bot uses real inline buttons and the
dashboard is reachable for the assessment. Stack: Vercel (app) + Neon (DB, already cloud) + Telegram webhook.

> Deploy = an external/public action. The main session (Opus) runs this WITH the user's confirmation
> (GitHub push, Vercel env, webhook). Do not push/deploy without the user's OK.

## Prereqs (status)
- GitHub account: `mirkomilovabrorwork-dot` ✅
- Vercel account (via GitHub) ✅
- Neon DB ✅ (same `DATABASE_URL`/`DIRECT_URL` used for local + prod — one DB is fine for the assessment)
- Secrets ready in local `.env` ✅ (ANTHROPIC, GROQ, TELEGRAM, AUTH_SECRET, WEBHOOK_SECRET)

## Step 1 — Push code to GitHub
```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
Set-Location C:\Users\localhost\Desktop\pultrack
# create the repo on GitHub (private is fine) and push:
gh repo create oson-moliya --private --source . --remote origin --push
# (or: create the repo in the GitHub UI, then `git remote add origin <url>` + `git push -u origin master`)
```
`.env` is gitignored — secrets will NOT be pushed (verified: `git ls-files` shows only `.env.example`).

## Step 2 — Import into Vercel + set env vars
1. vercel.com → **Add New → Project** → import the `oson-moliya` repo.
2. Framework preset: Next.js (auto). Build command stays default (`npm run build` → runs `prisma generate && next build`).
3. **Environment Variables** (Project → Settings → Environment Variables) — add ALL of these (values from local `.env`):
   `DATABASE_URL`, `DIRECT_URL`, `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `GROQ_API_KEY`, `STT_PROVIDER`,
   `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `AUTH_SECRET`, and `APP_URL`.
   - For `APP_URL`: first deploy gives a URL like `https://oson-moliya.vercel.app`. Set `APP_URL` to that, then **redeploy** so the bot builds https magic-links.
4. Deploy. Wait for green.

## Step 3 — Point the Telegram webhook at prod
Once `APP_URL` = the live Vercel URL (in local `.env`), register the webhook:
```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
Set-Location C:\Users\localhost\Desktop\pultrack
npm run set-webhook   # calls setWebhook to $APP_URL/api/telegram with the secret token
```
> This switches the bot from local long-polling to the prod webhook. (To go back to local dev, run
> `npm run bot:dev` — it deletes the webhook and polls.)

## Step 4 — Live smoke test (the demo flow)
- Open @oson_moliya_bot → `/start` → now shows a real **📊 Dashboard button** (https) → tap → live dashboard.
- Send a text expense + a **voice** message → confirm logging + dashboard updates.
- `/login` → dashboard link. Switch UI language UZ·RU·EN. Set a budget, exceed it via bot → alert.

## Step 5 — BotFather polish (optional, recommended)
@BotFather → `/setdescription`, `/setabouttext`, `/setcommands` (start, login, dashboard). (Text drafted in chat.)
Menu button: leave default or point to the bot (the dashboard needs the magic-link, so don't set a bare dashboard URL).

## Step 6 — Fill submission artifacts
In `README.md` replace the Live Demo TODOs with the real `@oson_moliya_bot` + the Vercel URL.
Record the demo (`docs/demo-script.md`). Product brief + "3 more days" already in `docs/`.

## Notes / gotchas
- Vercel Hobby function timeout: the `/api/telegram` route sets `maxDuration`; voice (download+STT+Claude)
  must finish within it — short voice messages are fine.
- One Neon DB for local + prod is acceptable here; if you want a clean prod, create a second Neon branch
  and use its URL in Vercel.
- After any code change: push to GitHub → Vercel auto-redeploys.
