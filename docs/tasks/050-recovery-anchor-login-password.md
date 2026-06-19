# Task 050 — Recovery anchor: optional username + password (with a clear WHY)

## Why
Identity today = the Telegram account (`telegramId`). Lose Telegram (deleted / new number → new id)
and the data becomes unreachable. Add an OPTIONAL username + password so the user can log into the
WEB dashboard without Telegram → reach + export all their data. Data is never lost.
**Design requirement (user): the user must UNDERSTAND why this matters** — plain-language WHY at setup.

## Scope (v1)
- username + password = a SECOND way to log into the web (alongside the Telegram code/magic-link).
- Recovery value: lost Telegram → log in with username+password → see data + JSON-export.
- OUT of v1 (note honestly): re-binding a NEW telegramId to the old account (bot side starts fresh).

## Backend (Opus, inline — security-critical)
1. **schema.prisma** `model User` (ADDITIVE): `username String? @unique` + `passwordHash String?`.
   (nullable = opt-in; @unique allows many nulls in Postgres.) Needs `prisma db push` to prod before deploy.
2. **src/lib/auth/password.ts** (NEW, zero-dep): Node `crypto.scrypt` + random salt, stored `salt:hashHex`.
   - `hashPassword(pw): Promise<string>` — 16-byte salt, scrypt 64 bytes.
   - `verifyPassword(pw, stored): Promise<boolean>` — recompute, `timingSafeEqual`; false on malformed.
   - `normalizeUsername(u): string` — trim + lowercase. `isValidUsername(u): boolean` — `/^[a-z0-9_]{3,20}$/`.
   - `isValidPassword(p): boolean` — length >= 8.
3. **POST /api/auth/set-credentials** (session-guarded, assertSameOrigin): body {username, password}.
   - require a logged-in user (getSessionUser → 401). Validate username + password (422 on bad).
   - normalize username; check uniqueness EXCLUDING self (taken by another user → 409 username_taken).
   - update the user: username + passwordHash = hashPassword(password). Return {ok:true}.
4. **POST /api/auth/password-login** (assertSameOrigin, RATE-LIMITED 8/10min per IP like /api/auth/code):
   - body {username, password}. normalize username; find user by username.
   - verifyPassword; on ANY failure (no user OR bad password) → generic 401 `invalid_credentials`
     (NO user enumeration). On success → createSession(user.id); return {ok:true, redirectTo:"/"}.
5. **tests/password.test.ts**: hash→verify roundtrip true; wrong password false; malformed stored false;
   isValidUsername / isValidPassword boundaries; normalizeUsername.

## Frontend (delegate — UI + the WHY copy, 3 langs)
API CONTRACT (code against this): `POST /api/auth/set-credentials {username,password}` → 200 {ok} |
422 invalid | 409 username_taken | 401 unauth; `POST /api/auth/password-login {username,password}` →
200 {ok,redirectTo} | 401 invalid_credentials | 429 too_many_attempts.
1. **/more — "Account protection" card** (in MoreClient + pass `hasUsername` from the /more server page,
   reading `getSessionUser().username != null`). 
   - If NOT set: a card titled (uz) "Hisobni himoyalash" with the WHY paragraph (below) + a form
     (login, parol, parolni tasdiqlang) → POST set-credentials → success toast.
   - If set: show "✓ Himoyalangan · login: <username>" + a "Parolni o'zgartirish" option.
   - WHY copy (uz): "Hozir hisobingiz faqat Telegram orqali ochiladi. Agar Telegramni yo'qotsangiz
     (o'chirib qayta o'rnatsangiz yoki raqamingiz o'zgarsa), ma'lumotlaringizga kira olmay qolishingiz
     mumkin. Login va parol qo'shsangiz — Telegramsiz ham kirib, barcha yozuvlaringizni ko'rasiz va
     yuklab olasiz." (+ ru/en equivalents.)
2. **/login — password option** (alongside the Telegram code): a "Login va parol bilan kirish" form
   (username, password) → POST password-login → on ok redirect; show errors (invalid/too many). One-line
   why: (uz) "Telegramsiz kirish uchun (zaxira usul)". 
3. **i18n** (dictionaries.ts): all strings uz/ru/en. Web uses icons not emoji (a lock icon for the card).

## Security checklist (Opus verifies)
- Passwords scrypt-salted, never plaintext; timing-safe verify. Username unique, validated, normalized.
- password-login rate-limited + NO user enumeration (generic error). set-credentials session-guarded +
  same-origin. No secrets/hashes leaked in responses or logs.

## Gates + verify
- typecheck · test · build green (Opus runs). 
- Opus VERIFIES on a real preview: set credentials (logged-in) → logout → log in with username+password →
  lands on dashboard with the same data. (This is web — fully verifiable, unlike bot-brain changes.)
- prod `prisma db push` (additive) BEFORE deploy; then deploy + a live smoke (password-login 401 on bad).
