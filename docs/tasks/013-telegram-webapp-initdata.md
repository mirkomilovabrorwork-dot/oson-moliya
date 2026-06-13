# TASK 013 — Native Telegram WebApp (Mini App) with initData auth

**Goal:** make the dashboard a real Telegram Mini App — it opens INSIDE Telegram and auto-authenticates via
Telegram's signed `initData` (no magic-link needed inside Telegram). Keep the existing magic-link + session
flow intact as the fallback for normal desktop browsers. Read `CLAUDE.md`, `docs/DESIGN.md`, `src/lib/auth/*`.

Hard constraints: PowerShell PATH prefix; no real secrets; don't break existing auth; typecheck+test+build green.
The bot uses **prod webhook** — do NOT run local polling (`bot:dev`) against the prod token. Do NOT push/deploy
(Opus reviews, sets the menu button, and deploys).

## 1. Server: validate initData + issue session — `src/app/api/auth/telegram/route.ts` (POST)
- Body: `{ initData: string }` (the raw `window.Telegram.WebApp.initData` query string).
- **Validate per Telegram's spec (security-critical — get this exactly right):**
  1. Parse `initData` as URLSearchParams. Pull out `hash`; collect the rest.
  2. `data_check_string` = the remaining pairs as `key=value`, sorted by key ascending, joined with `\n`.
  3. `secret_key = HMAC_SHA256(key="WebAppData", message=<TELEGRAM_BOT_TOKEN>)` (Node:
     `crypto.createHmac("sha256","WebAppData").update(botToken).digest()`).
  4. `computed = HMAC_SHA256(key=secret_key, message=data_check_string)` hex.
  5. Reject (401) if `computed !== hash`. Also reject if `auth_date` is older than 24h (replay guard).
  6. Use a timing-safe compare (`crypto.timingSafeEqual`) where possible.
- On valid: parse the `user` JSON field (Telegram user: id, first_name, username, language_code). Upsert the
  `User` by `telegramId` (reuse the same pattern as the bot/`getSessionUser`), `ensureDefaultCategories(user.id)`,
  then `createSession(user.id)` (reuse `src/lib/auth/session.ts` — sets the `pultrack_session` cookie). Return 200 JSON `{ok:true}`.
- The cookie must be set with `SameSite=None; Secure` so it works inside the Telegram in-app WebView (cross-context).
  Update `createSession` cookie options: when prod/https use `sameSite:"none", secure:true`; keep lax for localhost.

## 2. Client: Telegram WebApp bootstrap
- Load Telegram's SDK: add `<Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />`
  in `src/app/layout.tsx` (it's a no-op outside Telegram).
- On the `/login` page (where the proxy sends unauthenticated users), add a small **client** bootstrap component:
  on mount, if `window.Telegram?.WebApp?.initData` is a non-empty string →
  call `window.Telegram.WebApp.ready()`, `expand()`, then `POST /api/auth/telegram {initData}`; on `{ok:true}` →
  `window.location.href = "/"` (now authenticated). Show a small "Kirilyapti…" state during this.
  If NOT in Telegram (no initData) → render the existing normal `/login` UI unchanged.
- Apply Telegram theme niceties only if present (optional): `Telegram.WebApp.expand()`. Don't hard-depend on the SDK.

## 3. Bot: web_app buttons + menu button — `src/lib/telegram/reply.ts`
- In `dashboardReplyOptions`: when `APP_URL` starts with `https://`, the Dashboard inline button becomes a
  **web_app** button: `{ inline_keyboard: [[{ text: "📊 Dashboard", web_app: { url: APP_URL } }]] }` (opens the
  Mini App in-Telegram). Keep the plain-text link fallback for non-https (localhost). Update the grammY/TS types
  accordingly (InlineKeyboardButton supports `web_app`).
- (Opus will set the bot's default **menu button** to the Web App via `setChatMenuButton` after deploy — note this
  in the report; the agent can also add a `scripts/set-menu.ts` tsx helper that calls setChatMenuButton with
  `{ type:"web_app", text:"Dashboard", web_app:{ url: APP_URL } }` reading APP_URL+token from env.)

## 4. Keep existing flows working
- Desktop browser (no Telegram): magic-link from the bot still works (the bot reply, in https, will now be a web_app
  button — but desktop Telegram opens web_app too; for users on a desktop browser visiting the site directly,
  `/login` shows the normal UI). Ensure `getSessionUser`/proxy/magic-link are unchanged and still function.
- Do not remove `/api/auth/verify` (magic-link) — it stays as the fallback.

## Acceptance / gates
typecheck 0 · test green · build OK. Add a unit test for the initData HMAC validator (a known-good and a tampered
sample). Report: files changed, the exact validation implementation, the SameSite cookie change, gate results, and
note that Opus must (a) deploy, (b) run `set-menu`, (c) live-test opening the Mini App in Telegram.
Commit `feat(webapp): native Telegram Mini App via initData auth + web_app buttons`.
