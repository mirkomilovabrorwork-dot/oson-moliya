# PulTrack / Oson Moliya — resume board

_Trigger words: "pultrack", "pul track", "oson moliya". Source of truth for resume._
_Last updated: 2026-08-14. History → `docs/STATE_ARCHIVE.md` (nothing deleted). Deploys → `docs/DEPLOY_LOG.md`._

## GOAL — what "done" looks like
A Telegram bot (text **and voice**) + web dashboard that an Uzbek small business actually uses daily:
money in/out, debts, reports. Live in production, usable from the owner's phone.

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
**Currency picker on debts and accounts** — the owner asked for it twice; not started. Direction is
already decided (see Locked decisions), so this can begin without asking him anything.
Done-criterion: recording a debt in USD and repaying it in UZS shows **two separate lines**, no
conversion anywhere, and `npm run typecheck` + `npm test` + `npm run build` stay green.

## Blockers
None on my side. The only outstanding item is the owner's own phone test (below).

## OWNER TODO
- **(since 2026-08-12) Voice test.** Open `@oson_moliya_bot`, send a voice message such as
  *"logistikaga besh yuz ming chiqim"*. Expected: the bot writes back what it heard and records it as an
  expense. If it fails, send me the reply text — the model chain has two more models to fall back on.

## Open decisions — asked, NOT answered
- **Admin panel — waiting on his "ha".** Plan was shown 2026-08-05, no reply. Agreed scope: see users +
  totals + block/delete. Explicitly OUT: messaging users, reading their transactions, Excel export.
  Admin access keyed to his Telegram id `8582045913` via server config — deliberately NOT a DB flag,
  because a DB flag can be escalated by a DB write. **Blocking must be enforced in the BOT**, or the
  button is a lie. Nothing built yet.

## Locked decisions — do not re-litigate
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
