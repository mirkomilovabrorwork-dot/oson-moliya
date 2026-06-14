# Task 018 — P0 fixes + rubric alignment (pre-submission, deadline-focused)

## Goal
The app is already live and meets Task-01 requirements. Before the deadline, make the **required demo
path boringly reliable** and **align exactly to the rubric** — fix the visible bugs Codex found, fix
misleading finance wording, and make the README evaluator-proof. **Multi-currency (016) is DEFERRED**
(Codex: not an assessment blocker; risky right before deadline).

Source of findings: `docs/tasks/017-claude-execution-plan.md` (P0) + `017-ui-ux-finance-design-plan.md`.

## #1 design rule (sealed): every screen must be understandable AT A GLANCE by a business owner.

---

## SCOPE — exactly these 4 parts (P0). Nothing else.

### Part A — Fix `/transactions` (Yozuvlar) reliability  ⬅ most important (visible breakage)
Files: `src/app/(dashboard)/transactions/TransactionsClient.tsx` (+ `page.tsx` if passing formatted dates).
1. **Hydration/theme bug:** date formatting via `Intl.DateTimeFormat` differs server↔client → hydration
   mismatch → `data-theme` drops → page turns light while others stay dark. **Fix:** deterministic date
   rendering — format on the server and pass plain strings, OR a deterministic formatter from ISO parts +
   dictionary month labels (no locale-dependent client `Intl`). Acceptance: **no hydration error in console;
   `/transactions` keeps the same theme after reload + navigation.**
2. **Money spacing:** rows must render `-500 000 so'm` (space before `so'm`), never `-500 000so'm`. Mobile + table.
3. **Touch targets:** edit/delete buttons ≥ **44×44px**; ensure the FAB doesn't cover the last rows / row actions.
- **PRESERVE** the user's choices: keep the label **"Yozuvlar"**, keep `max-w-5xl` on this page.

### Part B — Honest finance wording on Home + rubric-visible Overview
Files: `src/app/page.tsx`, `src/lib/i18n/dictionaries.ts`.
1. **Rename the hero label** `home.balance` (it shows monthly NET, not a real balance):
   uz `Bu oy natijasi` · ru `Итог за месяц` · en `This month's result`. (Remove the misleading "Umumiy balans".)
2. **Rubric:** Overview must visibly show **income, expense, net, period comparison, and quick-add access.**
   - Keep income/expense/net on the hero/mini-stats.
   - Ensure a visible **period comparison** (e.g. "o'tgan oyga nisbatan ▲/▼ %") on the hero or mini-stats
     (re-add if the redesign dropped it).
   - Quick-add = the FAB (already there) — keep it obvious; no change needed beyond confirming it.
- Keep it simple / at-a-glance. No new cards-clutter.

### Part C — README evaluator-proofing (rubric alignment)
File: `README.md` (+ ensure links to `docs/product-brief.md`, `docs/three-more-days.md`).
1. **Top "Topshiriq havolalari / Assessment links" block:** live dashboard `https://oson-moliya.vercel.app`,
   live bot `@oson_moliya_bot`, GitHub repo, product brief, 3-more-days, and a **screen-recording placeholder**
   line (user adds the video link).
2. **Name = "Oson Moliya"** (user decision — the product name STAYS Oson Moliya). Lead the README with
   "Oson Moliya"; mention "PulTrack" at most once as the internal repo codename (or drop it). No "shipped as" confusion.
3. **"Assessment checklist"** section: map EVERY Task-01 requirement → where to see it (text+voice logging,
   intent, capture amount/type/category/date/note, follow-up, finance query, correction/deletion, custom
   categories; Overview/Transactions/Analytics/Categories/Onboarding; +1 budget alerts; submission items).
4. **Stack note:** briefly justify Claude tool-use + Groq Whisper as the structured-output/STT equivalent of
   the suggested OpenAI stack (swappable provider), so a rubric-literal reviewer isn't surprised.
5. Make README **match reality** (FAB = quick-add; bot replies in input language; no stale claims).

### Part D — Bot conversational UX: ask-or-buttons, "Yozildi", edit/delete  ⬅ the demo heart (user-requested)
Files: `src/lib/telegram/bot.ts`, `src/lib/telegram/reply.ts` (+ inline-keyboard builders). ADD interactivity
WITHOUT breaking the existing text/voice/clarify/correct/delete pipeline. **#1 rule applies: simple & convenient —
few buttons, clear labels, no clutter.**
1. **If the bot doesn't understand / a field is unclear → ask, OR give tappable inline-keyboard options.** Never silently save.
   - Type unclear → two buttons **[Kirim] [Chiqim]** (uz/ru/en labels).
   - Category unclear → buttons of the user's existing categories (top few) + **[Boshqa]** (then they type it).
   - Amount unclear → ask in text ("Qancha? Masalan: 500 ming"). Keep questions to ONE clear step.
   - Implement via grammY inline_keyboard + a `callback_query` handler that resumes the `PendingAction` draft
     with the chosen value and completes the save. Answer the callback (no spinner hang).
2. **On a successful save → "✅ Yozildi: …"** (localized confirmation, already exists) AND attach two inline buttons:
   **[✏️ Tahrirlash] [🗑 O'chirish]** for THAT record (encode the txId in callback data).
   - **O'chirish** → confirm with **[Ha, o'chir] [Yo'q]**, then soft-delete → "🗑 O'chirildi.".
   - **Tahrirlash** → reply guiding a quick correction ("Tuzatishni yozing, masalan: «300 ming» yoki «logistika»");
     the existing `correct_transaction` flow applies it to the last record. (Keep edit simple — no multi-field form.)
3. **Voice:** reply immediately before STT — uz "🎙 Ovozingizni o'qiyapman…" (fast webhook ack); after STT,
   **echo the transcript** "Eshitdim: «…»" then the normal confirmation/clarify.
- Safety: callback handlers must verify the record belongs to the user; soft-delete only; wrap in try/catch so a
  callback failure never crashes the bot. I cannot live-test Telegram here → the user verifies in the demo; the
  workflow includes a correctness critic for the callback/pipeline logic.

## OUT OF SCOPE now (do later only if time remains)
- Multi-currency (`016`); analytics mobile polish (P1); shared money/date formatter refactor (P1);
  nav change (KEEP `Qarzlar` in bottom nav — user's explicit choice, even though Codex suggested moving it);
  accounts/debts/export/audit/rate-limits (P2 roadmap).

## How it will be built & verified
1. **Build:** one ultracode workflow — parallel Sonnet agents (A / B / C / D, disjoint files), then an Opus
   correctness critic, then a fix pass. Agents must PRESERVE user edits (Yozuvlar, max-w-5xl, chart tweaks)
   and touch ONLY their assigned files.
2. **Review:** I (Opus) review the diff against this plan.
3. **Gates (must be green):** `$env:Path="C:\Program Files\nodejs;"+$env:Path` → `npm run typecheck` · `npm test` · `npm run build`.
4. **Deploy:** `npx vercel --prod --yes` (CLI logged in; GitHub auto-deploy OFF).
5. **Verify live:** authenticated HTML fetch of all routes (200, `/transactions` keeps dark theme, money has the
   space); confirm new routes/labels. Report to the user in simple Uzbek + ask them to do the final phone check.

## Acceptance criteria
1. `/transactions`: no hydration error, theme stays consistent, money is spaced + signed, actions ≥44px.
2. Home hero label accurately names the number ("Bu oy natijasi"); Overview shows income/expense/net + period comparison + quick-add (FAB).
3. README has the links block, naming clarity, and an assessment checklist; matches reality.
4. Bot: when unclear it asks OR shows tappable option buttons (type/category) and never silently saves; on save
   it says "✅ Yozildi" with [✏️ Tahrirlash] [🗑 O'chirish] buttons (delete asks Ha/Yo'q → soft-delete); voice
   gives immediate feedback + echoes the transcript. All simple/uncluttered. Existing text flow still works.
5. uz/ru/en complete; gates green; live deploy verified.

## One-commit shape
`fix(p0): reliable transactions, honest home wording, README rubric block, bot voice feedback`
(split only if it grows large).
