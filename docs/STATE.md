# PulTrack / Oson Moliya — resume board

_Trigger words: "pultrack", "pul track", "oson moliya". Source of truth for resume._
_Last updated: **2026-09-10** (owner redirect → Android app). History → `docs/STATE_ARCHIVE.md` (nothing
deleted). Deploys → `docs/DEPLOY_LOG.md`._

## GOAL — what "done" looks like
⭐ **OWNER REDIRECT 2026-09-10 — the goal moved.** PulTrack becomes a **real installable Android app**
that records money by **voice, by receipt photo, and by typing**. His requirement in his own words:
**"2 step menga 1 step kerak"** — today it is unlock → open Telegram → find the bot → hold mic → speak;
he wants ONE physical action from idle phone to "recorded". Target user for v1: **himself, daily** —
not a market product yet. He also chose **"faqat app qolsin, bot o'chsin"**; I accepted the decision but
ordered it safely: the bot is switched off ONLY after the app works on his phone, never before.

_Previous goal (still the substrate, not the destination): a Telegram bot (text **and voice**) + web
dashboard an Uzbek small business uses daily — money in/out, debts, reports, live in production._

**Where it really stands:** the product works and is deployed — but **16 real people signed up and none
stayed**. Measured 2026-08-05 on the prod DB: 21 accounts (5 of them test/demo), 114 transactions,
**0 users active in the last 7 days**, newest transaction anywhere 2026-07-13, and 8 people who opened
the bot and never logged a single entry. Voice — the bot's whole convenience — had been dead the entire
time. It is fixed now; whether that brings anyone back is the open question, not a settled one.

## Live system
- Web: **https://oson-moliya.vercel.app** (Vercel, project `moliyachi/oson-moliya`) · DB: Neon Postgres
- Bot: **@oson_moliya_bot** (webhook healthy: 0 pending, no last_error)
- Deploy: `npx vercel --prod --yes` — **then ALWAYS `vercel alias set <new-url> oson-moliya.vercel.app`.**
  Three deploys in a row created the production deployment but did NOT move the canonical alias. Verifying
  the deployment URL instead of the canonical one will show you a green build the public cannot see.

## NEXT STEP
**Android app, v1 — capture-first.** In flight since 2026-09-10. Order of work:
1. ✅ **DONE** — design + feasibility: `docs/plans/2026-09-10-android-one-step-capture.md` (the
   one-step mechanism, the first screen, the three flows and every failure state) and
   `docs/research/2026-09-10-android-webview-capture.md` (what a plain WebView actually needs for
   mic, camera, cookies, launcher shortcuts). Code-side truth:
   `docs/plans/2026-09-10-android-v1-code-findings.md`.
   **Decisions taken by me, not to be re-opened:** the app opens already recording; a capture saves
   itself with a one-tap "Bekor qilish" instead of a confirm step; `captureId` de-duplication is
   in-memory in v1, so **no Prisma migration was made**.
   **Verified live already:** `/manifest.webmanifest` returns 200 with the link tag injected, the
   theme colour is applied, and icons exist at `public/icons/` (192, 512, maskable 512).
2. ✅ **BUILT, then reviewed, now being repaired.** `POST /api/capture/voice` and
   `POST /api/capture/receipt` exist and work; `/capture` renders the capture-first home, recording,
   processing and done states. **Proven end-to-end on 2026-09-10**, not asserted: a real `audio/webm`
   clip posted to the live dev server produced transcript → intent → a saved 500 000 so'm expense in
   category `logistika`, attached to the default account, `source: "app"`, 5.4 s round trip; the row
   was then deleted again through the app's own DELETE endpoint (204).
   A **blind non-author review said DO NOT SHIP** and named 10 defects — 7 confirmed. The serious
   ones: no de-duplication at all (a retry after a timeout creates a second transaction), "Tuzatish"
   soft-DELETED the record and opened an empty form (abandon = record gone), an **open redirect** on
   `/login?next=`, receipts converted at a hardcoded rate while voice uses live rates, a microphone
   that keeps running if you cancel during the permission prompt, no upload timeout, and a
   confirmation clock that renders "bugun, 24:07" between 00:00 and 04:59.
   Both fix waves have LANDED. Gates: `tsc --noEmit` clean, **171 tests pass** (was 142 this morning),
   `next build` succeeds with `/capture` and `/manifest.webmanifest` in the route table.
   **Proven live after the fixes, in the browser:** posting the same `captureId` twice returns the SAME
   transaction id and leaves exactly ONE row — and the second call took 1.0 s against the first call's
   6.7 s, i.e. it short-circuited before transcription. The capture home lays out as designed at
   375×812 (primary 343×72 px in the thumb zone, two 48 px secondaries, no horizontal overflow) and
   renders correctly in dark mode (bg `#0d1117`, green gradient primary, white label).
   A **second blind review** is running. Nothing ships until it returns.
   Also fixed in passing, found by live testing: `src/lib/serialize.ts` walked a `Date` into `{}`, so
   **every** API response returned empty dates — pre-existing, app-wide, now `toISOString()`.
3. APK wrapper — **source complete** at `android/`, **but it cannot be built on this machine**: there
   is no JDK and no Android SDK here (the Takrorla plan describes the pre-reinstall laptop). Building
   needs ~1.5 GB of tooling installed first. **Not on the critical path** — the site is already
   installable as a PWA, which on Android gives a real home-screen icon, its own window, working
   microphone and camera, and the same three launcher shortcuts.
4. Only AFTER the app works on his phone: switch the bot off (his decision, safe ordering mine).

Done-criterion for v1: on his phone, ONE physical action from idle to a spoken expense recorded and
visibly confirmed; photo and manual entry work too; `npm run typecheck` + `npm test` + `npm run build`
stay green.

**Deferred by the redirect (not cancelled):** currency picker on debts and accounts. His answers on it
are settled — see Locked decisions — so it can resume any time without asking him again.

## Blockers
None on my side.

## OWNER TODO
- _(none right now — the 2026-08-12 voice test is absorbed into the app work: v1 cannot pass its
  done-criterion without a real spoken entry on his phone, so it will be tested there instead of asking
  him to test the bot a sixth time.)_

## Open decisions — asked, NOT answered
- **Admin panel — waiting on his "ha".** Plan was shown 2026-08-05, no reply. Agreed scope: see users +
  totals + block/delete. Explicitly OUT: messaging users, reading their transactions, Excel export.
  Admin access keyed to his Telegram id `8582045913` via server config — deliberately NOT a DB flag,
  because a DB flag can be escalated by a DB write. **Blocking must be enforced in the BOT**, or the
  button is a lie. Nothing built yet.

## Locked decisions — do not re-litigate
_(2026-09-10, one-tap answers — the ANDROID redirect)_
- **Target user for v1 = the owner himself, daily.** Not a market product yet; optimise for repeat use,
  not for onboarding strangers.
- **The whole point is step count:** "2 step menga 1 step kerak". Any design that adds a tap loses.
- **Bot off, app only** — his call. Ordering is mine and is not negotiable: the bot dies only after the
  app is proven on his phone.
- **First screen: he explicitly delegated the design** ("chuqurroq o'ylab yechim top… creativroq") and
  then delegated the whole task ("mensiz auto smart hal qil"). So the first-screen shape is MY decision,
  taken in `docs/plans/2026-09-10-android-one-step-capture.md` — do not re-ask him for it.

_(2026-09-10, one-tap answers — CURRENCY, still valid though deferred)_
- **Decimals: YES for USD/EUR** — "100.50$" must be storable. Whole-so'm-only input is not enough; this
  changes storage (minor units) and `src/lib/money-input.ts`, which is why it was asked before building.
- **A UZS payment against a USD debt does NOT reduce the remaining.** Both lines are shown; the owner
  closes the debt by hand. Direct consequence of the no-conversion rule — no rate is ever applied.
- **Each account has its OWN currency; entries in another currency stay a separate line** on that
  account rather than being converted or refused.


_(2026-08-11, answered by the owner via the HQ relay. The auto-appended DECISIONS block below records
these as "dismissed" because he answered in a different session — the answers here are the real ones.)_
- **Currencies:** UZS, USD, RUB shown first; the rest of the world's currencies selectable from a
  searchable list below. He named PLN and EUR as examples, NOT as the limit — do not hardcode a closed set.
- **NO conversion and NO exchange rate anywhere in debts.** A debt given in USD and repaid in UZS stays
  TWO lines ("100$ berildi · 500 000 so'm qaytarildi"). His deliberate correctness choice: a stored debt
  must never drift when a rate moves.
- **Reports: one row per currency**, never a single combined figure.
- **Per-person "oldi-berdi" view goes in BOTH the bot and the dashboard.**
- **Existing rows are UZS.** Not a guess: the column is literally `amountUzs`, no writer ever stored
  anything else, and `Transaction` already treats a null `originalCurrency` as UZS. Migration is additive;
  legacy rows are not touched.
- **Person identity = the normalized name** (trim + lowercase + collapsed spaces) as a grouping key, NOT a
  contact table — picking an autocomplete suggestion writes the identical string, which is where duplicates
  are actually created. A contact record can come later if renaming-in-one-place is ever needed.
- Current schema is UZS-only on `Debt.amountUzs`, `DebtPayment.amountUzs`, `Account.initialBalanceUzs`;
  `Debt.counterparty` is free text. **20+ files read those amount fields** — adapt them in the SAME change.

## Hard-won facts a fresh session must not rediscover
- **Browser-recorded `audio/webm` (Opus) is accepted by BOTH speech providers — measured, not assumed.**
  A synthesised webm clip returned HTTP 200 and a correct transcript from Groq Whisper (with the Blob
  labelled `audio/ogg` AND `audio/webm` — the existing mislabelling in `src/lib/stt/blob.ts` is
  harmless), and Gemini lists `audio/webm` among its supported inline-audio types. No server-side
  transcode is needed. This was the Android plan's flagged "day-1 probe"; do not re-open it.
- **`dateStringToUtc` was private to `bot.ts` and a second caller re-derived it wrong.** The brain
  returns the WORD `"today"`/`"yesterday"`, not an ISO string, so `new Date(intent.date)` is an
  Invalid Date and the save throws. It now lives in `src/lib/capture/occurred-at.ts` and both callers
  import it. Any THIRD entry path must import it too, never re-implement it.
- **A pinned LLM model is a time bomb, and ListModels is not proof.** Voice was dead for weeks because the
  STT provider was pinned to `gemini-2.5-flash`, which Google now 404s ("no longer available to new
  users") — while still LISTING it for the very key that fails. Only a real `generateContent` call proves a
  model is alive. Now a chain: `gemini-3-flash-preview` → `gemini-3.5-flash` → `gemini-flash-latest`.
- **A secret stored write-only cannot be debugged.** `STT_PROVIDER`/`GEMINI_API_KEY` were Vercel
  `type=sensitive`, whose values can never be read back by anyone — which is exactly why the outage was
  undiagnosable. Both are now `type=encrypted`: still encrypted at rest, readable via `vercel env pull`.
- **Money input: normalize, never reinterpret.** `src/lib/money-input.ts` is the ONE normalizer. Stripping
  every non-digit silently turned `-500000` into `500000` and `12.50` into `1250`. Anything not readable as
  one unambiguous whole amount returns `""` so the server refuses it **visibly**. Zero stays `"0"` — it is a
  legal opening balance. Asserted in `tests/money-input.test.ts`; do not "simplify" it.
- **A write endpoint must return the same shape its list endpoint returns.** `settleDebt`/`updateDebt` used
  to return a row without `paidUzs`; the client splices that row into its list, so the next payment computed
  `BigInt(undefined)` and threw *outside* the try/catch — a silent no-save. Checked: Accounts and Categories
  do NOT have this bug (verified live, they handle it correctly) — do not "fix" working code there.
- **CRLF churn is real here.** HEAD stores LF; Windows edits write CRLF and a 20-line change reads as 4000.
  Compare `git diff --shortstat` against `git diff -w --shortstat` before every commit.
- **`.claude/gate.cmd` runs ONLY typecheck**, though CLAUDE.md promises typecheck + test + build. The
  pre-commit hook therefore checks less than it claims — run all three by hand. Also: after a fresh clone the
  hooks are INERT until `git config core.hooksPath .githooks`.
- **Never run `npm audit fix --force`.** It downgrades next 16→9.3.3 and exceljs 4→3.4.0 and breaks prod. The
  4 "moderate" advisories (uuid inside exceljs, postcss inside Next) are both unreachable from our code and
  have no fixed version. Revisit only when exceljs >4.4.0 or a stable Next ships postcss ≥8.5.10.

## Known and deliberately unfixed
- `src/lib/report/excel.ts:379` computes a column letter with `String.fromCharCode(64 + totalCols)` — breaks
  past 26 columns. Dormant (max 6 today).
- The "📊 Hisobot" button path skips the `isRateLimited` check (the `/hisobot` command does not).
- Full CSP (`script-src`/`style-src` with a nonce via `proxy.ts`) — separate, large piece of work.
- **`X-Frame-Options` is deliberately absent.** This is a Telegram Mini App; Telegram's web client opens it in
  an iframe and both DENY and SAMEORIGIN turn it into a white screen. Protection is CSP `frame-ancestors`
  only. If anyone "hardens security" by adding XFO back, the Mini App breaks.

## Conventions
- Gate before "done": `npm run typecheck` + `npm test` + `npm run build` (currently **142 tests**).
- Node PATH: `$env:Path = "C:\Program Files\nodejs;" + $env:Path` (PowerShell tool, not Bash).
- Additive DB changes only. UTF-8 via Edit/Write only. Subagents never run git or deploy.
- Each task = one commit + a STATE update. Feature work gets a blind non-author review before shipping.
- Local dev: `preview_start` config `pultrack` (port 3002) in `D:\vibecoding\.claude\launch.json`.
  The API's same-origin guard reads `APP_URL`, which points at prod — for local API testing, temporarily
  append `APP_URL="http://localhost:3002"` to `.env.local` (gitignored) and restore it afterwards.

## DB migration APPLIED to production 2026-09-10
`20260910120000_tx_capture_id` — adds `Transaction.captureId TEXT NULL` + a unique index. Applied with
`npx prisma migrate deploy` after checking `_prisma_migrations` was in sync (5 applied, this one
pending). Verified present afterwards by querying `information_schema`. Additive and reversible;
existing rows are untouched (Postgres allows many NULLs under a unique index).
**Why it had to be applied BEFORE the deploy:** the build script only runs `prisma generate`, never
`migrate deploy`, so shipping the code first would have left the column missing — and every capture
would then have failed with `Unknown argument captureId`. This was observed for real: the running dev
server held a stale Prisma client and returned 500 on every capture until it was restarted and the
client regenerated. **A future schema change must apply the migration first, or ship a deploy step
that does.**

## ⚠️ TEMPORARY local env edits (2026-09-10) — undo before trusting a local run
`.env.local` (gitignored) had four lines APPENDED so the app could be driven live in a browser:
`ALLOW_INSECURE_DEV=1`, `APP_URL="http://localhost:3002"`, `CRON_SECRET="local-dev-only"`,
`STT_PROVIDER="groq"`. The original file is backed up in this session's scratchpad.
Two things a future session must know:
- **`CRON_SECRET` is REQUIRED by `src/lib/env.ts` but was missing from `.env.local`,** so `getEnv()`
  threw on every call and voice/receipt failed locally with a misleading `stt_failed`. That was an
  environment gap, not a code defect.
- **`DATABASE_URL` in `.env.local` is the PRODUCTION Neon database** (the file came from
  `vercel env pull`). Anything written locally lands in real data. The one test row created today was
  deleted again. Never run `prisma migrate dev` / `db push` from here.

## Uncommitted / untracked, on purpose
`.claude/settings.local.json`, `.codex-checkpoints/`, `RECOVERY_HANDOFF.md`,
`docs/tasks/022-automated-daily-backup.md` — pre-existing, not from recent work, left untracked by policy.

## DECISIONS (owner one-tap answers - auto-appended; a decided question is never re-asked)
- 2026-08-11 [Valyutalar] Qarz va hisobda qaysi valyutalar bo'lsin? -> **[User dismissed ΓÇö do not proceed, wait for next instruction]**
- 2026-08-11 [Aralash valyuta] Qarz dollarda berilib, so'mda qaytarilsa nima qilamiz? (bu pul aniqligining eng nozik joyi) -> **[User dismissed ΓÇö do not proceed, wait for next instruction]**
- 2026-08-11 [Hisobot] Umumiy hisobotda qarzlar qanday ko'rinsin? -> **[User dismissed ΓÇö do not proceed, wait for next instruction]**
- 2026-08-11 [Oldi-berdi] Bir odam bo'yicha 'oldi-berdi' hisobi qayerda ko'rinsin? -> **[User dismissed ΓÇö do not proceed, wait for next instruction]**
- 2026-08-12 [Ovoz] Bot ovozini nima bilan yozdiraylik? -> **Yangi Gemini kalit berdi; sabab kalit emas, o'lgan model edi — zanjir bilan tuzatildi (`de8aaf4`)**
- 2026-08-12 [Kod tartibi] Jonli kod `main`da emas edi -> **Birlashtirildi va push qilindi**
- 2026-08-12 [Deploy] 38 kunlik kutayotgan o'zgarishlarni chiqaraymi? -> **Ha, chiqarildi (`c562e8a`)**
- 2026-08-14 [Tiyin] Dollar/yevro qarzlarda tiyin (sent) kerakmi? -> **Ha, tiyin bo'lsin (100.50$)**
- 2026-08-14 [Aralash to'lov] Dollarlik qarzga so'mda to'lov kiritilsa, qoldiq nima bo'lsin? -> **Qoldiq o'zgarmasin, ikkala satr ko'rinsin (tavsiya)**
- 2026-08-14 [Hisob valyutasi] Hisob (kassa/karta) valyutasi qanday ishlasin? -> **Har hisobning o'z valyutasi, boshqa valyuta alohida satr (tavsiya)**
- 2026-09-10 [Kim uchun] Bu app KIM uchun? (birinchi va eng muhim savol ΓÇö qolgan hamma javob shunga bog'liq) -> **Avval o'zim uchun ΓÇö har kuni ishlataman (tavsiya)**
- 2026-09-10 [Nega app] Telegram bot NEGA yetmayapti? (bittadan ko'p tanlash mumkin) -> **2stap menga 1step kerak**
- 2026-09-10 [Bot taqdiri] Telegram bot qolsinmi yoki app uni almashtirsinmi? -> **Faqat app qolsin, bot o'chsin**
- 2026-09-10 [Birinchi ekran] Appni ochganda BIRINCHI nima ko'rinsin? -> **chuqurroq oylab yechim top yoki fabel 5.1ga yechim topdir creativroq bu**
