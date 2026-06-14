# Oson Moliya — Master Plan (single source of truth)

> Internal repo codename: PulTrack. **Shipped product name = "Oson Moliya" (stays).** Data365 "vibecoder"
> assessment, Task 01 — Business Finance Manager for Uzbek SMBs. Repo: `C:/Users/localhost/Desktop/pultrack`.
> Live: bot **@oson_moliya_bot** + dashboard **https://oson-moliya.vercel.app**. Deploy:
> `npx vercel --prod --yes` (Vercel CLI logged in; GitHub auto-deploy OFF — **push ≠ live**).
>
> Produced by an adversarial workflow (deep draft → 3 critics: rubric / deadline-ROI / simplicity-honesty → revise),
> then a coverage audit (Codex) + a 7-role expert panel; both verified against the code before acceptance.
> Findings folded in below are marked file:line so the implementing agent does not re-derive them.

## 1. Vision & #1 rule
Oson Moliya lets an Uzbek small-business owner track money by talking or typing to a Telegram bot
("250 ming logistikaga chiqim") and see a calm, trustworthy money picture on a phone dashboard.
**#1 RULE (sealed):** every screen and every bot reply must be understood **at a glance (bir qarashda)** by a
non-technical owner. Simplicity & convenience beat features/cleverness/density. When in doubt, remove, don't add.
→ This rule is exactly why the heavy inline-button work is cut to a minimum and pushed off the critical path.
**Honesty corollary:** the numbers must be trustworthy and consistent across Home, Analytics, and the bot, and the
docs must describe ONLY what ships. A dashboard and a bot that tell different money stories, or a README that claims a
feature the app lacks, both fail the #1 rule for a finance evaluator.

## 2. Current status — DONE & LIVE (do NOT re-do) — verified at HEAD `afc586e`
- **Bot @oson_moliya_bot — LIVE.** Text + voice (Groq Whisper STT), Claude tool-use brain (intent +
  amount/type/category/date/note), finance queries, report, **text-based** clarify-loop, correction + delete of
  last record, custom categories. Trilingual uz/ru/en (default uz). `bot.catch`; webhook always 200; `maxDuration=30`.
  - Verified: `clarify_needed` (bot.ts:232), `correct_transaction` (:292), `delete_transaction` (:363) all work →
    **rubric #6 (clarify) and #8 (correct/delete) are GREEN on the shipped text flow.**
  - Verified: voice already sends `typing` chat action + echoes `🎤 {transcript}` (l.539/552). A 2nd "Eshitdim" echo =
    redundant, do NOT add. NOTE: `typing` is a *post*-handler indicator that auto-expires ~5s; it is NOT the same as an
    up-front "processing" text line, and on a slow voice path it can look like a hang (see R4 / P0-D-voice below).
  - Verified: **NO `bot.callbackQuery` handler exists** → any inline-button UX is genuinely new, untestable-here code.
- **+1 feature — LIVE:** proactive monthly budget alert (once/month guard). NOTE: `checkBreach` (budgets.ts:13) fires
  only at `spent >= limit` (at/over 100%), while the dashboard `BudgetBar` (BudgetBar.tsx:27) shows a 70% "warn" state —
  bot and UI disagree on "at risk". Acceptable for MVP **as a "limit reached/exceeded" notice** (see P0-B wording + Phase 3).
- **Dashboard — LIVE, Kissa IA:** bottom nav Bosh sahifa / **Yozuvlar** / Qarzlar / Yana + FAB; Home = balance hero +
  expense donut + recent + budget bars; /more = theme + language + Hisoblar/Kategoriyalar/Asosiy valyuta(UZS)/Chiqish;
  Analytics (3 charts), Categories (+budgets), Onboarding, Transactions (filters/search/inline edit/delete + typed delete).
  /debts + /accounts = "Tez orada".
- **Infra:** Telegram initData HMAC auth is the *primary* prod path; **magic-link route is still present in code** as the
  non-Telegram/localhost fallback (`/api/auth/verify`, `token.ts`, `reply.ts:42-43`) — see §5 R6 (the old "magic-link
  removed" claim was inaccurate). Soft-delete; API money hardening; blue/slate palette.
- **Repo is PRIVATE** (`github.com/mirkomilovabrorwork-dot/oson-moliya`) → evaluator access is a hard gate (§3 #17, §6).
- **The only required submission item left = the user records the demo video.** Everything below makes that recording
  boringly reliable and the repo rubric-proof — recordable from the deployed app at every point in the plan.

## 3. Rubric coverage matrix (✅ done · ⚠️ at-risk · ⬜ todo)
| # | Requirement | Status | Note |
|---|---|---|---|
| 1 | Bot text | ✅ | — |
| 2 | Bot voice + STT | ✅ | acks (`typing`) + echoes `🎤 transcript`; real risks = 30s webhook (R4) + duplicate save on retry (R9) |
| 3 | Intent detection | ✅ | — |
| 4 | Capture amount/type/category/date/note | ✅ | foreign-currency fallback hole → P0-E guard (R10) |
| 5 | Natural reply + confirm | ✅ | "✅ Yozildi: …" |
| 6 | Follow-up when unclear | ✅ | text clarify-loop GREEN; buttons are nice-to-have only; demo the empty-amount beat |
| 7 | Finance query | ✅ | text uses "Balans" for net → fix to honest "Sof/Itog/Net" in P0-B (analytics.ts:302/395) |
| 8 | Correction / deletion | ✅ | text "tuzat/o'chir" GREEN; **demo-script guard** for the PendingAction collision (R1b) |
| 9 | Custom categories | ✅ | make obvious in demo; do NOT delete a category on camera (R12) |
| 10 | Overview income/expense/net/**period comparison**/quick-add | ⚠️ | **period comparison ABSENT from rendered home** → P0-B (render-only); README already over-claims it (R7b) |
| 11 | Transactions list/filters/search/inline edit-delete | ⚠️ | **hydration/theme drop + money spacing + <44px** → P0-A; same hydration bug on Home (R3b) |
| 12 | Analytics | ✅ | mobile clutter = P3; but check hardcoded chart colors are legible in the demo theme (§6) |
| 13 | Categories management | ✅ | — |
| 14 | Onboarding empty state | ✅ | record on a FRESH/clean account; verify empty states on /, /transactions, /analytics (§6) |
| 15 | +1 budget alerts | ✅ | **deliberately demo** (clearly *exceed* a budget on camera so the `>=` boundary fires) |
| 16 | README + brief + 3-more-days | ⚠️ | links block + checklist + naming + **argued** stack note + auth/cash-basis honesty → P0-C |
| 17 | Live bot / dashboard URL **+ repo access** | ⚠️ | confirm URLs public (no Vercel protection) **AND evaluator can open the PRIVATE repo** (§6) |
| 18 | **Screen recording** | ⬜ | **demo-script.md is STALE — rewrite FIRST (P0-0)**; the real pass/fail artifact |

## 4. Phased roadmap (deadline-ordered)
**Ordering principle:** land the certain, low-risk, required wins first so the demo is recordable BEFORE the riskiest
code is attempted. The shipped text clarify/correct/delete already satisfies #6/#8, so inline buttons are
default-deferred. Commits split by risk surface so a bot regression can never roll back the safe dashboard/docs fixes.

### PHASE 1 — Submission readiness (P0, DO NOW) — two commits
**Commit 1 (the submission-blocker):** P0-0 + P0-A + P0-B + P0-C + P0-E (tiny brain guard) → deploy → P0-QA → lock.
**Commit 2 (optional, post-submission):** P0-D minimal bot buttons → revertible in isolation.
Built as parallel Sonnet agents on disjoint files + Opus critic + fix pass. **PRESERVE user edits** ("Yozuvlar",
`max-w-5xl` on transactions, `Qarzlar` in bottom nav, chart/home tweaks); touch only assigned files.

- **P0-0 — Rewrite `docs/demo-script.md` to deployed reality** ⬅ DO FIRST (~20 min, docs only).
  The current script (last edited at first commit `931e46d`) contains concrete FALSEHOODS the rewrite MUST delete —
  list them explicitly for the agent so none survive:
  - Product title still "PulTrack" → "Oson Moliya".
  - Scene 2 "magic-link authentication, no login screen" + an `[📊 Dashboard →]` inline button → **there is no
    callbackQuery handler**; replace with opening the Mini App via the in-Telegram WebApp/menu button (initData auto-auth).
  - Scene 1 a typing TEXT line like "⏳ tinglayapman…" → the code (bot.ts:539) sends only a silent
    `replyWithChatAction('typing')`; script the REAL beats: "bot shows typing indicator → echoes `🎤 {transcript}` →
    `✅ Yozildi: …`". Paste the exact shipped strings (verify against `src/lib/telegram/reply.ts` before scripting) so the
    recorder can pattern-match success on camera.
  - Drop the `.env.local`/`APP_URL` setup block (not part of a user-facing demo).
  - **PROMOTE to main scripted scenes (not "time permitting"):** (a) the empty-amount clarify beat — send
    "logistikaga chiqim" (no number) → bot asks "Qancha so'm?" → answer "500 ming" → saved (proves #6, no silent save);
    (b) a text CORRECTION "oxirgisini 900 ming deb tuzat" and a text DELETE "o'chir" (rubric #8 core trust moment).
  - Use a SHORT known-good Uzbek voice phrase (≤4 words), pre-tested 3× on prod (de-risks R4); decide the fallback BEFORE
    recording: if any of 3 prod voice round-trips exceeds ~15s, record the PRIMARY expense-log scene via TEXT and show
    voice only as a short secondary clip.
  - **Demo-data + save-certainty rules (carry into recording):** record on a clean/fresh account so totals reconcile and
    the "new record appears" beat is obvious (shared local+prod Neon DB → clear stray test rows first); after every bot
    save, **explicitly RELOAD/re-open the dashboard** (server-rendered, no live poll) so the new record is visibly present
    — scroll the Home recent list + updated number into frame; do NOT delete a category on camera (R12); single-send each
    message (no double-tap → avoids the duplicate-save R9); keep the recorded demo single-language (uz) to avoid the bot's
    per-message language auto-flip; never say a foreign-currency amount on camera until P0-E lands (R10).

- **P0-A — `/transactions` reliability + Home period-comparison render** ⬅ most visible breakage.
  A1 (deterministic dates — kills hydration/theme drop, R3): replace locale-dependent `Intl.DateTimeFormat` with a
  deterministic formatter (ISO-parts + dictionary months). **This bug exists in BOTH places — fix both:**
  `TransactionsClient.tsx:50-55` AND **`src/app/page.tsx:16-21` (Home `formatDate`)** — Home is the first screen on
  camera. Also align the `/transactions` date FILTER boundary (`TransactionsClient.tsx:113-120`, an ad-hoc `getTime()+5h`
  path) to the SAME Tashkent helper used for rendering so "filter to today" matches the rows shown. Before deploy, grep
  `Intl.DateTimeFormat` across `src/` (AnalyticsClient and others may also need it). Keep the formatter LOCAL (no shared-
  helper refactor now — that is Phase 3). Money always `-500 000 so'm` (spaced + signed) on mobile + table.
  **44px touch targets — name the exact selectors (dual table+card layout):** mobile-card icon buttons
  `TransactionsClient.tsx:536` and `:548` are `w-8 h-8` (32px) → bump to `w-11 h-11` (44px); desktop action buttons
  `:671`/`:683` are `min-h/min-w-[36px]` → 44px. Keep the 14px icon, enlarge the hit area; FAB/bottom padding must not
  cover the last row. Verify with the automated 44px check on a 375px viewport — the mobile branch is what ships in the demo.
  A2 (Home period comparison — render-only, reuse `getOverview()`'s `prevIncome/prevExpense/prevNet`,
  transactions.ts:93-95,144-146; do NOT fetch a second period). The existing `StatCard.formatDelta`
  (StatCard.tsx:26-37) is financially WRONG — specify the EXACT guard rules and add unit tests:
  - **Zero / no-prior-data:** if the prev-period total is 0 (fresh evaluator account, first active month) → show a
    neutral phrase (uz "o'tgan oyda ma'lumot yo'q" / "yangi", ru/en equivalents), **never** a %, never `Infinity%`/`∞`/`NaN`.
  - **Sign change:** if prev and current have *different* signs (e.g. net −X → +Y) → do NOT show a %; show an absolute
    movement line (uz "o'tgan oy −X → bu oy +Y" or the absolute delta in so'm). A % over `abs(prev)` across a sign flip is
    economically meaningless.
  - **Same-sign only:** show a percentage ONLY when prev and current share a sign; compute over `abs(prev)`; round to an
    integer %; clamp absurd values (`>999%` → ">999%").
  - **Direction is metric-aware:** income/net higher = good (▲ green); expense higher = bad (▲ red). The current expense
    branch is correct; the **net branch is wrong** (it derives good/bad from the raw diff sign) — fix it.
  - Unit tests required: `prev=0`, `prev<0 → current>0` (sign change), and `expense-down` cases.

  A3 (window consistency — render-affecting, do it in Commit 1): the Analytics SSR page uses
  `occurredAt { gte: monthStart, lte: now }` (analytics/page.tsx:22-31) — an INCLUSIVE "lte now" bound, whereas
  Home/`getOverview` use a half-open `[monthStart, monthEnd)` window (transactions.ts:122-127) and `AnalyticsClient`
  itself documents "to is EXCLUSIVE". Change analytics/page.tsx to the SAME `[monthStart, monthEnd)` (lt: first day of
  next Tashkent month) so Home, Analytics, and the bot report identical "bu oy" numbers on camera. Defer the shared-helper
  extraction to Phase 3.

- **P0-B — Honest finance wording on Home AND the bot.** The honesty fix is NOT dashboard-only:
  - Home hero: rename `home.balance` (overwrite the value in `dictionaries.ts:170/367/564` — only Home consumes the key,
    no new key needed) → uz **"Bu oy natijasi"** / ru "Итог за месяц" / en "This month's result" (it is monthly net, not a
    balance). Verify the NEGATIVE-net case visually: a leading "−X so'm" under "Bu oy natijasi" must read as a loss, and
    the income(green)/expense(red) sub-line must read as a breakdown of that result, not a separate number. Add tiny scope
    captions so adjacent numbers don't count different windows: "Bu oy" on the hero/period block, "So'nggi yozuvlar"
    (all-time) on the recent list.
  - **Bot net label (string-only, same honesty change):** change the bot's "Balans/Баланс/Balance" net label in BOTH the
    `report` branch (analytics.ts:302) and the `net` branch (analytics.ts:392/395) to a net/result word — uz "Sof
    (kirim−chiqim)" or "Bu davr natijasi", ru "Итог (доход−расход)", en "Net". Touch only those label literals; keep
    emoji/numbers. The bot is the rubric-#7 demo, so on-camera it must not call income−expense a "Balans".
  - **Budget-alert wording:** make the alert text precise — "budjet limiti oshib ketdi" (exceeded), not a vague "alert" —
    so it is honest about being an at/over-100% notice rather than an early warning.
  - Period line is the most-droppable item if time is tight (a wrong delta is worse than none) — **BUT** if it is dropped,
    P0-C MUST remove the README "month-on-month comparison" claim and §3 row #10 must be marked ⚠️ partial, not ✅. The
    render and the README claim are decided together, never independently (R7b).

- **P0-C — README + docs evaluator-proofing** ⬅ WRITTEN LAST (describes only verified behavior).
  - Top "Topshiriq havolalari / Assessment links" block: dashboard, bot, GitHub repo, brief, 3-more-days,
    recording placeholder; name = "Oson Moliya" (PulTrack ≤ once as codename); "Assessment checklist" (§3 matrix → where
    to see each).
  - **Reconcile every existing README feature-verb against the deployed app before rewriting** (R7b): the current README
    already over-claims "month-on-month comparison" and a "quick-add form" (line 24) that `page.tsx` does NOT render (it
    is a FAB/AddSheet, not a form). Remove/align every claim that isn't shipped (period comparison — see P0-B coupling;
    "quick-add form" → "quick-add (FAB)"; UZS-only guard wording).
  - **Fix the README auth description (security-critical, R7a):** README lines **~49 and ~53** still describe auth as
    "magic-link (bot button) → HttpOnly session cookie" / "the bot issues a one-time magic-link (10 min TTL)". The
    *primary* prod path is **Telegram WebApp initData HMAC**. State the real, COMPLETE surface: "Prod auth = Telegram
    initData HMAC validation (24h freshness window); magic-link is retained as a non-Telegram/localhost fallback (short
    TTL, single-use). initData replay inside the 24h window is accepted as standard Mini App behaviour; the only state
    change is an idempotent session upsert." A technical evaluator who reads "magic-link" then sees initData in code takes
    it as a docs-vs-code mismatch on the most sensitive claim.
  - **Argued stack-justification subsection (R16, NOT a parenthetical):** a named "Why Claude + Groq instead of OpenAI"
    section, 3–4 sentences: (1) structured output is achieved via forced tool-use + zod validation (functionally
    equivalent to OpenAI structured-output / function-calling); (2) STT is swappable via the existing `STT_PROVIDER` env
    var (groq|openai) — OpenAI Whisper can be enabled with no code change; (3) the choice is cost / latency / Uzbek-accuracy
    driven. Make this a deliverable acceptance item.
  - **One honest "what does net mean" line (finance credibility):** "Oson Moliya is a cash-flow tracker (cash basis): each
    record is real money in/out. 'Bu oy natijasi' = this month's income minus expense, not an account balance or accounting
    profit. Transfers, debts/receivables, and true balances are on the 3-day roadmap." No code change; pre-empts the
    bookkeeper/finance evaluator.
  - **Security/limitations section:** state the conscious trade-offs so they read as decisions, not oversights — the
    SameSite=None cookie + same-origin guard (see P0-E note), initData 24h replay window, and the records view showing the
    most-recent 500 until server-side search lands. Since P0-D is deferred, describe **text-based** #6/#8 — do NOT claim
    buttons or a 2nd echo unless P0-D actually shipped + phone-verified.

- **P0-E — Tiny, high-value bot/API safety guards (Commit 1; live in `brain.ts`/route/shared helper, NOT the buttons).**
  These are small, additive, and protect the live demo + the security persona. Land them with Commit 1:
  - **Foreign-currency fallback hole (R10, blocks #4 on camera):** the prompt asks Claude to clarify "100 dollar"
    (prompts.ts:26-31), but `brain.ts:90-98` calls `parseAmountUzs` whenever amount=null, and `amount.ts` Step 4
    (`\b(\d{2,})\b`) matches the "100" → logs a 100 so'm expense. Guard: before the amount fallback, if the text matches a
    currency token (`dollar|do'llar|do'lr|\$|евро|euro|€|rubl|рубль|₽|£|¥`) skip `parseAmountUzs` and force
    `clarify_needed` with `missing_fields=['amount']`. Add the "100 dollar" row to P0-QA.
  - **Webhook idempotency / duplicate-save (R9, double record on retry/double-tap):** `webhookCallback` runs synchronously
    under `maxDuration=30`; a slow voice path → Telegram re-delivers the same `update_id` → the record is saved twice.
    Add a minimal processed-update guard BEFORE the handler: persist `update.update_id` via a unique-constrained insert
    (a tiny `ProcessedUpdate` table or an existing-table unique column) wrapped in try/catch; on unique-violation return
    200 without re-processing (~15-25 lines). Add the "send same message twice" row to P0-QA.
  - **GET /api/transactions input validation (R11, P0-A edits this exact route):** lines 31-32 `parseInt(limit/offset)`
    and lines 65-66 `new Date(fromParam/toParam)` have no guards → `limit=abc`/`offset=-5`/`limit=999999`/`from=garbage`
    become Prisma 500s. Clamp: `limit = min(max(finite?n:50,1),100)`, `offset = max(finite?o:0,0)`; for dates mirror the
    analytics route — if `isNaN(getTime())` return **422**, not 500. ~10 lines, no schema change. Add an adversarial-param
    row to P0-QA.
  - **Same-origin guard on mutating dashboard routes (R6-CSRF):** the session cookie is `SameSite=None; Secure`
    (session.ts:37) so it rides inside Telegram's WebView; every mutating route (POST /api/transactions:111,
    PATCH/DELETE /api/transactions/[id]:30/102, categories, budgets) authenticates on that cookie ALONE. Add a shared
    `assertSameOrigin` helper (~10 lines) called at the top of each POST/PATCH/PUT/DELETE handler: reject with 403 unless
    the `Origin` (or `Referer` host) equals the `APP_URL` host. Telegram WebView requests carry the app's own Origin, so
    the Mini App is unaffected. **If deemed too risky before the deadline:** skip the code, but the README security
    section MUST state the SameSite=None + no-CSRF trade-off as a conscious decision (persona #8).
  - **Voice-input size cap (cost/abuse + the most-likely on-camera timeout):** `download.ts:21` does `arrayBuffer()` with
    no limit and bot.ts ships the whole buffer to STT. Before downloading, reject voice with Telegram-reported
    `duration > ~60s` or `file_size > ~5MB` with a friendly "audio too long" reply (and/or abort the download past a
    Content-Length cap). Tiny, additive; removes a memory blow-up + STT-cost spike + the R4 timeout in one change.
  - **Abuse / rate-limit + provider spend caps (R6-cost):** the public bot calls Groq STT + Claude on EVERY message with
    NO per-user cap, NO global daily ceiling, NO allowlist — a stranger who finds the published username can exhaust the
    paid keys mid-evaluation. Add a cheap defence before the STT/brain calls: a per-Telegram-user sliding window
    (~20 AI msgs / 10 min) and/or a global daily counter that short-circuits with a friendly "busy, try later". **At the
    absolute minimum (must-do even if code is deferred):** set provider-side spend caps on the Anthropic and Groq keys and
    document it in the security section — a flood must not be able to fail the live demo for the assessor.

- **P0-D — Minimal bot inline buttons (DEFAULT-DEFERRED; separate commit; OFF critical path).**
  NOT a blocker (#6/#8 already pass). Only if Commit 1 lands with time to spare AND the user wants it. Scope CUT to the
  minimum (≤ one button row, never a wall): (1) **[Kirim] [Chiqim]** only when type is genuinely unclear; (2) on save,
  ONLY **[🗑 O'chirish]** → confirm **[Ha, o'chir] [Yo'q]** → soft-delete. DROPPED: [✏️ Tahrirlash] button (2 taps to reach
  the text flow that already works), the 2nd voice echo (already exists), category-picker buttons. New `bot.callbackQuery`
  handler, always `answerCallbackQuery`, tiny self-contained payloads (carry txId), verify record ownership, soft-delete
  only, try/catch so a callback never crashes the bot, preserve draft intent on resume. **HIGHEST risk in the project;
  text flow is the permanent fallback; user phone-verifies.**

**Pre-submission HONESTY fix (inside Commit 1) — broader than the currency row.** Codex design-contract #7 = "no fake
controls or unfinished modules shown as if they work". Confirm on camera that:
- **"Asosiy valyuta (UZS)" row** (`MoreClient.tsx:120-158`) — this is NOT inert; it is a real expanding accordion with a
  rotating chevron and a panel ("Hozircha faqat UZS — boshqa valyutalar tez orada"). The misleading part is the trigger
  sub-label key `more.currency_sub` = "Asosiy valyutani tanlash" / "Choose main currency", which promises a CHOICE that
  does not exist. **Fix:** reword `more.currency_sub` in all three langs (`dictionaries.ts:162/359/556`) to read
  informational (e.g. "Hozircha faqat UZS"), OR collapse it to a non-expanding inline row. Do NOT leave a "choose" label.
- **`Qarzlar` (bottom nav) and `Hisoblar` (/more)** visibly read as "Tez orada / roadmap", NOT as broken/dead controls —
  `Qarzlar`-in-nav is a LOCKED decision (kept) so it must look intentional to personas #3/#5, not a dead tab.

### PHASE 2 — Multi-currency, AFTER submission is locked
**The block below IS the spec — there is no separate `docs/tasks/016-multi-currency.md` file (it does not exist; the only
016 file on disk is `016-oracle-deploy.md`). Do not link a phantom file.**
Locked: base = UZS (`amountUzs` unchanged); user picks ONE display currency; ALL amounts show converted into it; live
**CBU** rates (free JSON, ~6h cache, hardcoded fallback); bot detects USD (dollar/do'llir/do'lr/$), EUR (evro/yevro/euro/€),
RUB (rubl/рубль/₽). Additive: new `src/lib/currency.ts` (pure) + `src/lib/rates.ts` (server) + `PUT /api/currency` + one
field `User.displayCurrency`. Aggregations stay in `amountUzs`; only display converts. Large/cross-cutting → after lock.
Once this ships, turn the /more currency accordion into a real control (the P0-E honesty reword is superseded then).

### PHASE 3 — P1 polish (017 P1)
Analytics mobile (ranked bars over pie on mobile, no number-wrap, **chart colors via design tokens, not hardcoded
`#059669`/`#dc2626` hex** in `IncomeExpenseChart.tsx`/`TrendLine.tsx`); shared money/date/Tashkent-period helpers (extract
the P0-A1 local formatter; the A3 window fix already aligns analytics — finish the centralization here); separate
"pending clarification" state from "last action"/`lastTransactionId` (the structural fix for the R1b collision the demo
script merely tips around); QuickAddForm Tashkent-local default date (`QuickAddForm.tsx:21-23` uses UTC `toISOString()` →
near Tashkent midnight pre-fills yesterday); render a per-row `source` tag (mic/voice, bot text, manual — `tx.source` is
already selected and passed to `TxRow` but never rendered) for provenance/trust; a visible "last updated" timestamp +
"Jami: N yozuv" count on Home/transactions for save-certainty; a brief highlight on the most-recent row; minus-glyph
consistency (dashboard uses U+2212, bot uses ASCII "-" — pick one or document the divergence); data-safety copy.

### PHASE 4 — P2 roadmap (017 P2) — NOT an assessment blocker (the "3 more days" doc)
Accounts/cashboxes + transfers (enables a true "Umumiy balans" + /accounts; resolves the cash-vs-accrual gap honestly);
debts/receivables ledgers (fills Qarzlar); secretary fields (counterparty, payment method, document, status, note) + daily
close + **duplicate detection** (the 60s same-user/amount/type/category soft-guard, broader than the R9 update_id fix);
CSV/XLSX/PDF export; **category soft-delete or name-snapshot-on-write** (today a category hard-delete nulls historical
`categoryId` → past months' breakdown changes retroactively + those rows become un-findable by the category filter; the
demo-script guard "don't delete a category on camera" covers the submission window, this is the real fix); audit log/undo;
security hardening (full CSRF tokens beyond the same-origin guard, server-side pagination/search beyond the 500-row view,
analytics date-rollover validation `from=2026-13-45`, magic-link issuance rate-limit + token-in-chat-history note, initData
nonce/single-use, avg-metric BigInt precision + required `query.type`); observability (health page/admin command, log
drain, friendly failure messages, **separate local/prod DB** so the demo account is never polluted by dev rows).

## 5. Risks & mitigations (top)
| # | Risk | Mitigation |
|---|---|---|
| R1 | Bot inline-button (P0-D) — new untestable callback code; clarified expense → income | Default-deferred + separate commit; self-contained payloads; preserve draft intent; Opus critic; phone-verify; text flow is default |
| R1b | **Shipped TEXT** correct/delete rides on one overloaded `PendingAction.lastTransactionId` (bot.ts:184-189/256/292/362); a clarify message overwrites it with no txId → a later "o'chir" mis-targets / says "yaqin tranzaksiya yo'q" | **Demo-script guard:** record → immediately correct/delete with NO clarify in between (structural fix = Phase 3). P0-QA row "log → unclear msg → o'chir". Optional cheap fix: in correct/delete handlers, when pending has no txId, fall back to the user's most-recent non-deleted bot tx |
| R2 | Demo video is the real pass/fail; script ≠ app | Rewrite demo-script.md to reality FIRST (P0-0) listing the exact false claims to delete; record from prod after deploy; RELOAD dashboard after each bot save; trip budget alert on camera |
| R3 | Theme/hydration regression — **on BOTH /transactions AND Home (page.tsx:16-21)**, same `Intl.DateTimeFormat` mechanism | Deterministic date formatting in P0-A1 across both files (grep `Intl.DateTimeFormat` first); verify **zero hydration errors in a real browser console** (HTML-fetch 200 ≠ proof) |
| R4 | **Voice vs 30s webhook = most likely on-camera failure** (timeout → silent 200, no error reply) | Measure 3 prod voice round-trips on a phone FIRST; numeric gate ~15s → else text-primary; SHORT ≤4-word phrase pre-tested 3×; voice size cap (P0-E); decide the recover-move BEFORE recording |
| R5 | Prod-vs-local drift incl. **DB schema drift** | push ≠ live → always `npx vercel --prod --yes`; **before deploy run `npx prisma migrate status` against prod DATABASE_URL → "up to date", else `prisma migrate deploy` first**; re-run demo vs prod |
| R6 | Secrets/abuse hygiene (token/DB/keys in repo/logs/video; CSRF; cost exhaustion) | **Before Commit 1:** `git status`, remove `build.log`/`test.log`/screenshots/media, confirm `.env` gitignored, grep the diff for tokens/DB URLs. Same-origin guard + rate-limit/spend caps (P0-E). Record via initData (no magic-link token on screen), close devtools/Network before recording, clean demo account |
| R7a | README auth claim is FALSE (says magic-link; prod = initData HMAC, lines ~49/53) | P0-C rewrites the auth section to the real, complete surface (initData primary + magic-link fallback + 24h replay note) |
| R7b | README over-claims a feature the app lacks ("month-on-month comparison" + "quick-add form", README line 24) | P0-C reconciles every feature-verb vs the app; P0-A2 render and the README claim are decided TOGETHER; #3 row #10 stays ⚠️ if the line is dropped |
| R8 | Deadline / overbuild | Hard order P0-0→A→B→C→E→deploy→P0-QA→lock→then D / Phase 2-4; currency + heavy bot UX deferred |
| R9 | **Duplicate record** on webhook retry / double-tap (no `update_id` dedup anywhere) | `update_id` idempotency guard in P0-E; single-send in the demo; P0-QA "send twice" row |
| R10 | **Foreign-currency amount silently logged as so'm** ("100 dollar" → 100 so'm via amount fallback) | Currency-token guard in P0-E forcing clarify; demo never says a foreign amount until it ships; P0-QA "100 dollar" row |
| R11 | `/api/transactions` GET 500s on adversarial params (QA persona #4 sends noisy input) | Pagination clamp + date-422 in P0-E (this route is edited by P0-A anyway) |
| R12 | Category hard-delete retroactively changes history + orphans rows from the category filter | Submission: demo-script "never delete a category on camera"; real fix (soft-delete/snapshot) = Phase 4 |

## 6. Execution & verification protocol
- **Build:** P0-0 (docs) first/parallel; then parallel Sonnet agents on disjoint surfaces (one owns /transactions A1/A-44px,
  one owns home+dictionaries A2+A3+B+honesty-reword, one tiny agent owns the P0-E brain/route guards); Opus correctness
  critic; fix pass; P0-C README last. P0-D = separate later agent on bot.ts/reply.ts only.
- **Review:** main Opus reviews `git diff` vs each acceptance list; `/code-review` for the P0-E guards and any bot callback logic.
- **Gates (green before done):** `$env:Path="C:\Program Files\nodejs;"+$env:Path` → `npm run typecheck` · `npm test`
  (incl. the new `formatDelta` zero/sign-change/expense-down unit tests) · `npm run build` (capture to logs, read them).
  Before deploy: `npx prisma migrate status` against prod (R5). Phase 2 also runs `prisma migrate dev` + `prisma generate`.
- **Deploy:** `npx vercel --prod --yes` (push ≠ live).
- **P0-QA — written pass/fail matrix run against PROD before lock (the artifact, not an assertion).** Create
  `docs/qa-pass.md`: each row = exact input → expected reply → actual; run once on a phone against @oson_moliya_bot.
  Minimum rows (every one green or a documented known-limitation before lock): clean voice expense; clean text income;
  **unclear amount** ("logistikaga chiqim", no number → "Qancha so'm?"); **foreign currency** ("100 dollar" → clarify, not
  100 so'm); **duplicate** (same message twice → no double record); wrong category then "tuzat"; **"o'chir" immediately
  after a clarify-then-log** (R1b); adversarial GET param on /transactions (no 500); switch to **ru then en** (replies in
  the matching language, no untranslated uz strings / mojibake; bot vs dashboard language may differ).
- **Live verification (this exact order):**
  1. **Voice latency on a phone vs prod** (R4) — 3 round-trips on the recording phrase; apply the ~15s gate.
  2. **Zero hydration errors in a real browser console** across all routes after reload+nav (R3) — HTML-fetch 200 does NOT
     prove this; explicitly include **Home** (the second `Intl.DateTimeFormat` site).
  3. **Fresh-user path:** open prod as a brand-new user (no records) and confirm `/`, `/transactions`, `/analytics` each
     show an empty-state with a next-action (no crash on the empty donut/charts) — onboarding beat #14.
  4. **Money + labels honesty:** new "Bu oy natijasi" hero (incl. the negative-net case), period line guards, bot net label
     no longer "Balans", `more.currency_sub` not a "choose" label, `Qarzlar`/`Hisoblar` read as roadmap, money spaced/signed.
  5. **Analytics in the demo theme (dark):** confirm the hardcoded chart greens/reds are legible (2-min visual check; full
     token refactor stays Phase 3).
  6. **i18n sweep:** switch the UI to **ru and en**, confirm the new period-comparison line, hero label, and currency row
     have no missing keys / mojibake.
  7. **Recording hygiene:** clean/dedicated demo account (clear stray rows on the shared Neon DB); close devtools/Network
     before recording (cookie/initData not on camera); record via initData (no magic-link token on screen).
  8. **Public access (both):** dashboard + bot URLs reachable with NO Vercel password protection, **AND** the evaluator can
     open the PRIVATE GitHub repo — make it public for the submission window OR add the evaluator as a collaborator
     (a private repo with no access is a hard fail regardless of quality).
- **Commits:** Commit 1 (P0-0+A+B+C+E, the submission blocker) → deploy + P0-QA + lock; Commit 2 (P0-D, bot only,
  revertible). **Before Commit 1:** decide per untracked doc commit-or-gitignore (commit MASTER_PLAN + STATE; commit the
  017/018 internal plans as roadmap or gitignore them — do NOT leave them dangling; there is no 016-multi-currency.md to
  commit), then run the R6 secret-scrub (`git status` clean, no `.log`/`.env`/screenshots/media tracked, grep diff for
  tokens/DB URLs). Each commit updates `docs/STATE.md` ⚡ STATUS + a simple-Uzbek report (lead with outcome).
  Co-Authored-By line on commits.
- **PRESERVE user edits always:** "Yozuvlar" (not Tranzaksiyalar/Harakatlar); `Qarzlar` kept in bottom nav; `max-w-5xl`
  on transactions / `max-w-2xl` elsewhere; multi-currency deferred.

## 7. Highest-ROI next step
Make the submission recordable + rubric-literal + honest in ONE bot-safe Commit 1, deploy, run P0-QA, lock it — heavy bot
UX last:
1. P0-0: rewrite `docs/demo-script.md` to reality (~20 min, docs only) — delete the named false claims; promote the
   empty-amount clarify + text correct/delete beats; record on a clean account with explicit dashboard reloads.
2. Parallel: P0-A (transactions + Home hydration/spacing/44px + Home period-comparison render with the exact delta guards +
   the A3 window fix), P0-B (honest "Bu oy natijasi" + bot net label + budget-alert wording + currency-row reword), and the
   tiny P0-E guards (foreign-currency, update_id idempotency, GET validation/422, same-origin, voice cap, rate-limit/spend
   caps). Then P0-C README last (verified behavior + auth fix + argued stack note + cash-basis line).
3. Opus critic → fix → gates (+ `prisma migrate status`) → `npx vercel --prod --yes` → P0-QA on prod → live-verify per §6
   (voice latency, zero hydration incl. Home, fresh-user empty states, labels/honesty, i18n ru/en, recording hygiene,
   public dashboard + repo access) → hand to the user to record the production demo per the rewritten script.
4. Only AFTER the submission is locked, if time + the user wants it: P0-D (minimal [Kirim]/[Chiqim] + [🗑]→Ha/Yo'q, no edit
   button, no 2nd echo, no category buttons) as a separate revertible commit, phone-verified, behind the text flow.

The required artifact is the demo, and it already passes on the shipped text flow — text path is the **default**, inline
buttons are the **bonus**, and the recording can be made before the riskiest code is ever attempted. The P0-E guards and
P0-QA matrix turn "it passes" from an assertion into something demonstrated and boringly reliable on camera.
