# Task 017 - UI/UX finance review, repair plan, and future design contract

Execution note:
Claude should read `docs/tasks/017-claude-execution-plan.md` first. This file is the long audit/reference appendix, not the day-to-day checklist.

## Why this exists
The user asked for the whole dashboard to be reviewed as both:
- a UI/UX designer: simple, pleasant, calm, mobile-first, not cluttered;
- a finance/product person: numbers must be clear, trustworthy, and hard to misread.

This file is the Claude-visible source of truth for fixing the current UI/UX issues and for future dashboard updates. Before changing visible dashboard UI, read this file and follow it unless the user explicitly chooses a different design direction.

Primary user direction:
- "UI va UX da xato bo'lmasin"
- "dizayn sodda va yoqimli bo'lsin"
- Avoid a heavy enterprise dashboard. This should feel like a small-business owner can open it on a phone and understand cash movement in 10 seconds.

## Current audit summary
Reviewed local authenticated dashboard at `http://localhost:3002` on a mobile-size in-app browser:
- `/`
- `/transactions`
- `/analytics`
- `/categories`
- `/more`

Useful screenshots were created during audit but should not be committed. Recreate browser screenshots when implementing.

Observed good direction:
- Home is much better as a summary page than the old form-heavy dashboard.
- `Yozuvlar` is a better user-facing term than "Tranzaksiyalar".
- The home expense category bars are simple and readable.
- More/settings page is close to the right mental model.
- Typed delete confirmation is the right direction for data safety.
- Mobile horizontal overflow was not present in the audited pages.

Critical problems found:
1. `/transactions` has a React hydration mismatch caused by locale/date formatting. The page is server-rendered with one date string and hydrated with another. This can cause the whole client tree to regenerate and it was observed to drop `data-theme`, making `/transactions` switch to light while other pages remain dark.
2. Mobile transaction amount text can render as `-500 000so'm`, with no space before `so'm`.
3. Analytics mobile is visually overloaded: KPI cards split numbers into awkward lines and Recharts labels/legend can concatenate category names.
4. Bottom nav currently exposes `Qarzlar`, but that route is only "coming soon". Prime bottom-nav space should not point to unfinished core finance functionality unless the goal is to demo roadmap.
5. The home hero label says "Umumiy balans", but the number is effectively current-period net, not a true account balance. A finance user may read this wrong.
6. `Asosiy valyuta` looks actionable but only shows UZS. Either make it real via task 016 or make the row clearly informational.
7. Mobile edit/delete icon buttons are 32px. Touch targets should be at least 44px for repeated finance workflows.
8. Some chart colors are still hardcoded hex in components instead of semantic tokens.
9. FAB can cover content near the bottom on long mobile lists.

Additional product/engineering weaknesses found earlier and still relevant:
1. Voice bot flow is not trustworthy enough yet. User expects voice -> transcript -> AI understanding -> saved record, with a visible transcript and immediate clarification if unclear. This should be treated as a user-facing UX flow, not only a backend feature.
2. Telegram WebApp/auth flow needs one clear model. The app has WebApp/initData work in place, but Claude must verify the actual bot button, Telegram Mini App open path, auto-auth, and fallback login copy end-to-end on prod.
3. Bot conversation state is too overloaded. Pending clarification and "last transaction for edit/delete" should not fight each other after fast consecutive messages.
4. Voice processing can exceed webhook limits. Telegram download + STT + Claude + DB write may hit Vercel webhook duration on longer audio.
5. AI reliability is under-tested end-to-end. There are unit tests, but not enough full mocked bot-flow tests: text/voice -> parse -> DB write -> confirmation -> edit/delete -> dashboard visibility.
6. Rate limiting and abuse controls are missing. Telegram webhook, magic-login issuing, Claude calls, and STT calls can be spammed.
7. Data safety is still MVP-level. Typed confirmation helps, but there is no undo, restore, export, backup, or audit log UX.
8. One Neon DB appears to serve both local and production. This makes local testing risky because demo/prod data can be mutated.
9. Finance model is incomplete for a real SMB finance product: accounts/cashboxes, transfers, debts/receivables, counterparties, payment methods, import/export, reconciliation, and role/team access are missing or placeholder-level.
10. Observability/support is weak. There is no clear health page, Sentry/log drain, admin bot command, webhook status UI, or friendly "why did voice/login fail?" troubleshooting path.
11. Production deploy is not automatic from GitHub according to `docs/STATE.md`; Vercel CLI is the deploy path. Claude must not assume push == live.
12. Multi-currency is planned separately in `docs/tasks/016-multi-currency.md`; current `Asosiy valyuta` UX must either be implemented from that task or made visibly non-interactive.
13. Dashboard client pages load too much data for future scale, especially transactions (`take: 500`). This is okay for demo but should become server pagination/search before real usage.
14. Accessibility polish is incomplete: touch target sizes, keyboard focus, screen-reader labels for icon buttons, and chart alternatives need a pass.
15. Date/timezone formatting is a recurring risk. Finance periods must consistently use Tashkent time and deterministic rendering to avoid hydration bugs and incorrect filters.

Additional expert review pass (frontend + backend + secretary/operator + finance):

Frontend / UX:
1. `QuickAddForm` defaults date with `new Date().toISOString().slice(0, 10)`, which is UTC/browser-time dependent. For an Uzbekistan finance product, manual entry default date should be Tashkent-local and consistent with bot/backend period logic.
2. `/analytics/page.tsx` uses a different default period implementation from `/api/analytics` and `src/lib/services/analytics.ts`. It uses `monthEnd = new Date(Date.now() + 5h)` with `lte`, which is not the same as the API's `[from, to)` convention and can include the wrong window. Centralize period helpers.
3. The dashboard has too many local money/date formatter copies. This causes inconsistent signs, spacing, date hydration, and future multi-currency bugs. Create shared formatter utilities.
4. Error and empty states are not operational enough. A secretary/operator needs clear next action: retry, edit, contact admin, open bot, export, etc.
5. Charts currently need text/list alternatives. A bookkeeper should not have to read a pie chart to answer "where did money go?"
6. The floating add button should never hide important bottom content. Long lists need enough bottom padding and/or FAB hiding near row actions.
7. Console warnings matter before deploy. The browser showed a React hydration mismatch and a script-rendering warning; both must be cleared or explicitly understood.

Backend / security:
1. CSRF risk: production sessions may use `SameSite=None` for Telegram WebView. All mutating dashboard routes (`POST/PATCH/PUT/DELETE`) should have CSRF protection or at least strict Origin/Referer checks for the app domain.
2. API `limit`/`offset` values are not clamped. A bad client can request too much data or weird pagination values. Validate and cap limits.
3. Date inputs in API routes use `new Date(...)` without consistent validation. Invalid dates should return 422, not leak DB/runtime errors.
4. Budget `limitUzs` parsing can throw on invalid strings if `BigInt(...)` receives bad input. Use the same safe positive amount schema everywhere.
5. Analytics fetches all transactions for a period and aggregates in memory. Fine for demo, but use DB aggregation/groupBy for scale.
6. Category delete is hard-delete. Because transactions use `onDelete: SetNull`, historical records lose their category label. For finance history, archive/soft-delete categories instead, or snapshot category name on transactions.
7. There is no audit trail for edit/delete. Finance apps should record who/when/what changed for trust and recovery.
8. Sessions/magic tokens have no user-visible session management, no cleanup job, and no rate limit. Add cleanup and revoke-all/session-list later.
9. Telegram initData validation checks age and HMAC, but replay within the valid window is still possible. Usually acceptable for Mini Apps, but document the risk and keep session issuance guarded.
10. No request/body size guard is obvious for dashboard APIs. Keep payloads small and return friendly 413/422 errors where needed.

Secretary / operator workflow:
1. Records need better administrative metadata: counterparty (`kimdan/kimga`), payment method, account/cashbox, attachment/receipt, status, and operator note. Without these, a real secretary cannot reconcile daily work.
2. There is no daily close/cash reconciliation flow. A secretary often needs "today's cash should equal X" and a checklist before closing the day.
3. There is no duplicate detection. Voice/text repeated messages can create duplicate records. Add a "possible duplicate" guard for same amount/category/time.
4. There is no export/print/share report flow. Office users need Excel/CSV/PDF or at least CSV export for accountant handoff.
5. There is no approval/review state. A bot-recorded transaction may need "draft -> confirmed" if the amount/category was guessed by AI.
6. There is no search by person/vendor/document number because the data model does not store these fields.
7. There is no bulk correction workflow. Secretaries often fix a batch after review; current UI is one row at a time.

Finance expert:
1. The app currently tracks income/expense, but not true accounting balances. Calling current-period net "balance" is misleading until accounts/cashboxes exist.
2. Transfers are missing. Moving money between cash/card/bank should not count as income or expense.
3. Debts/receivables are missing as real ledgers. A payable/receivable is not the same as an expense/income until paid, depending on cash/accrual model.
4. There is no cash vs accrual policy. The app should be explicit: this is cash-flow tracking, not full accounting, unless expanded.
5. Budgets are per category per month only. No weekly/yearly budgets, no rollover, no warning thresholds, no planned vs actual.
6. Categories are too flat. Real businesses may need category groups, subcategories, project/order/customer dimensions.
7. No opening balances. If accounts are added, each account needs opening balance and effective date.
8. No reconciliation/import. Real finance workflows eventually need bank/card import, cash reconciliation, or manual statement matching.
9. No tax/VAT fields. This may be okay for MVP, but do not market it as full business accounting.
10. No role/team access. A business owner and secretary often need different permissions.

Assessment-specific failure risks (Data365 Task 01):
1. The task explicitly lists the product as **PulTrack**, while the shipped brand is **Oson Moliya**. This is not fatal if explained, but evaluator confusion is possible. README/product brief should say clearly: "PulTrack, shipped as Oson Moliya for Uzbek users."
2. The task's tech stack says **OpenAI Whisper + OpenAI structured output**. Current implementation uses **Groq Whisper + Anthropic Claude tool-use**, with OpenAI STT only as a swappable provider. If the assessor checks stack literally, this can cost points. Either switch provider/model to match the spec or explicitly justify the equivalent structured-output/tool-use approach in README.
3. The task requires the Overview page to include **income, expenses, net, period comparison, quick-add form**. Current Kissa-style redesign removed inline quick-add into a FAB/sheet and may have reduced period-comparison visibility. This is a high assessment risk. Keep a visible quick-add affordance and period comparison on Overview or document the FAB/sheet as quick-add in a way the evaluator cannot miss.
4. The screen recording requirement is the real pass/fail demo: **voice message -> bot response -> dashboard update**. If voice STT is unreliable or the dashboard does not visibly refresh/update in the recording, the project can fail even if code is good.
5. The evaluator may test bot follow-up behavior. The bot must ask a clear follow-up when amount/type/category/date is unclear and must never silently save a guessed bad record.
6. Correction/deletion of recent transactions must be demoable. Current implementation relies on a single `PendingAction.lastTransactionId`; fast consecutive messages or clarifications can break user expectations. For assessment, prepare and test a simple "last one" correction/delete script.
7. Custom categories must be obvious. If the bot auto-creates categories but the dashboard/category page does not make that visible, the evaluator may not notice the feature.
8. The extra feature must be easy to see. Monthly budget alerts are implemented, but the demo must deliberately exceed a budget and show the bot alert. Otherwise the assessor may think the extra feature is only in README.
9. README currently risks drifting from implementation: it mentions quick-add form, magic-link TTL, UZS-only guard, Claude/Groq, and live behavior. Before submission, README must match the actual deployed app exactly.
10. Product brief and "3 more days" docs exist, but they must be linked from README or easy to find. A busy evaluator may not browse `docs/` manually.
11. GitHub repo cleanliness matters. Untracked task docs, temp logs, screenshots, `.env`, and local-only changes should not create confusion. Commit only intentional docs/code; keep secrets ignored.
12. Live deployment must be verified after the final commit. `docs/STATE.md` says GitHub auto-deploy is not used; Vercel CLI deploy is required. A pushed repo alone may not update live.
13. The evaluator may open the app as a fresh user. Onboarding must work with an empty account and guide them to Telegram examples without dead ends.
14. The evaluator may test in English or Russian because the app advertises 3 languages. Missing keys, mojibake, or untranslated strings can damage perceived quality.
15. The assessment deadline is one day. Overbuilding accounts/debts/multi-currency can be worse than polishing the exact required demo path. Prioritize the rubric first.

Submission logistics risks that can still fail the assessment:
1. GitHub repo access: if the repo is private, the evaluator must have access before submission. A perfect project fails if they cannot open the code.
2. Live bot availability: Telegram webhook must be active, the bot must respond quickly, and the username must be correct in README/product brief/demo.
3. Production environment drift: Vercel env vars must match the final code. Local success does not count if live bot/dashboard use stale env values.
4. Demo data hygiene: the recording should use clean, understandable records. Old/random test data can make analytics confusing or make the dashboard look broken.
5. Screen recording quality: voice must be audible, bot reply readable, dashboard update visible, and the flow should not rely on hidden terminal actions.
6. Evaluator account path: if the evaluator tests fresh, `/start`, login/WebApp, onboarding, first record, and dashboard must work without manual DB seeding.
7. Rate/cost exhaustion: Claude/STT keys must have enough quota during evaluation. Add a fallback/error message if AI/STT fails.
8. Time-to-first-response: bot replies must be fast enough for a live assessment. Long voice processing without feedback can look like failure.
9. Browser/device compatibility: Telegram in-app browser, desktop browser, and mobile viewport should all work. Do not test only local Chrome.
10. Sensitive data leakage: README, screenshots, video, commits, and logs must not include API keys, tokens, DB URLs, private user data, or the remote token URL.
11. Repo cleanliness: generated logs, screenshots, `.env`, build artifacts, and half-finished docs should not be committed unless intentionally part of the submission.
12. Final live verification: after the final Vercel deploy, run the exact demo flow once more against production and update README links if anything changed.

Evaluator-persona red team: who will check this and how they may fail it

1. First-pass recruiter / coordinator
   - Likely time: 2-5 minutes.
   - They may not run code. They will open README, GitHub, live bot, live URL, and video.
   - Failure mode: missing/incorrect links, private repo access missing, video absent, README too long but not skimmable, product name confusion.
   - Required fix: README top section must have a clean "Assessment links" block: GitHub, bot, dashboard, demo video, product brief, 3-more-days. No hunting.

2. Technical evaluator / senior engineer
   - Likely time: 10-30 minutes.
   - They will skim architecture, run tests/build if they can, inspect bot/API/security, and look for fake/fragile AI glue.
   - Failure mode: env/setup unclear, tests fail, hydration warnings, secrets leaked, unsafe webhook/auth, no validation, too much local/prod drift, code that only works on seed data.
   - Required fix: all gates green, README setup accurate, no secrets, CSRF/rate-limit risks documented, production verified.

3. Product / agency evaluator
   - Likely question: "Does this solve the Uzbek SMB bookkeeping problem in one day?"
   - Failure mode: overbuilt dashboard but unreliable core flow; charts look nice but bot voice/logging fails; "balance" wording misleading; accounts/debts placeholders distract from required features.
   - Required fix: focus demo on one painful workflow: owner speaks expense -> bot logs -> dashboard shows updated month -> report question -> correction/delete -> budget alert.

4. QA tester / adversarial checker
   - They may send unclear inputs, voice with noise, duplicate messages, foreign currency, wrong category, "delete last", and open dashboard on phone.
   - Failure mode: silent bad save, no follow-up, duplicate record, slow voice with no feedback, bot crash, dashboard mismatch, mobile UI overlap.
   - Required fix: scripted QA matrix with pass/fail before submission; bot must never silently save uncertain data.

5. Real SMB owner
   - They care less about architecture and more about trust.
   - Failure mode: cannot tell whether number is balance/profit; cannot correct mistakes confidently; app feels like a dashboard toy, not daily money tool.
   - Required fix: simple language, clear signed money, "what happened" confirmation, easy edit/delete, no ambiguous finance labels.

6. Long-time secretary / bookkeeper
   - They will ask: "Can I reconcile this at day end and explain it to the owner?"
   - Failure mode: no counterparty/payment method/account/document status/export; no audit trail; category delete loses historical classification.
   - Required fix: do not claim full accounting; position as fast cash-flow tracker. Mention 3-day roadmap for reconciliation/export/accounts.

7. Hiring manager for a vibe-coding role
   - They evaluate not only product but how the builder thinks under time pressure.
   - Failure mode: flashy UI with brittle core; no clear tradeoffs; docs mismatch reality; no evidence of testing; over-scoped unfinished modules.
   - Required fix: show strong judgment: working live demo, concise README, explicit limitations, green gates, pragmatic roadmap, no hidden broken features.

8. Security/privacy-minded reviewer
   - They may inspect auth, env, DB access, webhook secret, and data isolation.
   - Failure mode: leaked tokens, public logs with secrets, weak session model, mutating APIs vulnerable with SameSite=None, no abuse control around paid AI calls.
   - Required fix: no secrets in repo/video, secret webhook verified, session cookies secure, CSRF/origin risk at least documented and preferably fixed, AI/STT rate limits planned.

9. Rubric-literal reviewer
   - They compare line by line against the task statement.
   - Failure mode: missing Overview quick-add form/period comparison, OpenAI stack mismatch, no screen recording, extra feature not visible, onboarding not shown.
   - Required fix: add an "Assessment checklist" to README and make each item demonstrably visible.

Final red-team conclusion:
- The project does not fail because it lacks more features; it fails if the required demo path is not boringly reliable.
- The highest ROI before submission is: live demo flow, README/checklist, screen recording, hydration/theme fix, voice reliability, and exact rubric alignment.

## Product design target
The product should feel:
- simple, quiet, and trustworthy;
- finance-first, not chart-first;
- mobile-first;
- Uzbek-first, but clean in ru/en too;
- calm enough for daily repeated use.

The user should be able to answer these questions quickly:
1. This month, am I up or down?
2. Where is money going?
3. What was the last recorded item?
4. Can I add, edit, or safely delete a record?
5. Can I trust that the number means what it says?

## Non-negotiable future design rules
1. Prefer light-first or system-first for "sodda va yoqimli"; keep dark mode polished, but do not let dark styling make the app feel heavy.
2. Color carries meaning:
   - blue/accent = action or active selection;
   - green = income/positive;
   - red = expense/destructive;
   - everything else neutral.
3. No decorative gradients, glows, glass effects, rainbow icon tiles, or colorful UI just to look rich.
4. Cards are neutral. Do not make summary cards solid green/red; color the number, not the whole card.
5. Money is always signed where income/expense matters:
   - income: `+1 000 000 so'm`
   - expense: `-500 000 so'm` or U+2212 consistently
   - net: signed, with color based on positive/negative.
6. Money is always tabular, right-aligned in lists/tables, and includes a visible space before currency.
7. Mobile touch targets: at least 44x44 for buttons and row actions.
8. Do not put unfinished or "coming soon" modules in primary nav unless the user explicitly asks to show roadmap.
9. Do not use charts where a ranked bar list is clearer. On mobile, category bars beat pie charts.
10. No hardcoded chart hex colors in React components. Use CSS tokens or computed token values.
11. Avoid nested cards. Use one card per real section; page sections should breathe.
12. All visible text must exist in uz/ru/en dictionaries.
13. Every destructive action needs typed confirmation or an undo path.
14. All UI changes must be browser-smoked on mobile and desktop before deploy.

## Recommended information architecture
For the near-term assessment/demo, bottom nav should be:
1. `Bosh sahifa`
2. `Yozuvlar`
3. `Tahlil`
4. `Yana`

Move `Qarzlar` to `Yana` until the debts module is real. Keep `Hisoblar` in `Yana` until accounts are real. If debts/accounts are implemented later, they can return to primary nav only when they have useful content.

Reason: for a finance app, a bottom nav item promises a core workflow. A "coming soon" primary tab makes the product feel incomplete.

## Terminology contract
Use these user-facing terms unless the user changes direction:
- `Yozuvlar`: nav label for transaction records.
- `Kirim-chiqim yozuvlari`: page title for the records page.
- `Kirim`: income.
- `Chiqim` or `Xarajat`: be consistent per screen. Prefer `Chiqim` for transaction type, `Xarajat` for expense analytics/category context.
- `Bu oy sof natija`: if the hero number is current-month net.
- `Umumiy balans`: only if accounts/cashboxes exist and the value is a true balance.

Keep internal routes and API names unchanged (`/transactions`, `amountUzs`, etc.) unless doing a deeper refactor.

## Implementation plan

### Phase 0 - Preserve current work and scope
- Run `git status --short`.
- Do not revert user/Claude changes.
- Treat `docs/tasks/016-multi-currency.md` as a separate pending task; do not implement it as part of this UI repair unless the user explicitly asks.
- Remove any generated screenshot/debug artifacts before commit.

### Phase 1 - P0 reliability and theme consistency
Fix these before any visual polish:

1. Fix `/transactions` hydration mismatch.
   - File: `src/app/(dashboard)/transactions/TransactionsClient.tsx`
   - Current risk: `Intl.DateTimeFormat` can output different date strings on server/client.
   - Recommended fix: make date formatting deterministic and locale-stable.
   - Option A: pass already formatted date strings from `page.tsx` and render them as plain strings.
   - Option B: implement a deterministic formatter from ISO date parts and dictionary month labels.
   - Acceptance: no React hydration error in browser console; `/transactions` keeps the same theme as the rest of app after reload and navigation.

2. Fix theme persistence after navigation.
   - Verify `data-theme` remains set on `document.documentElement` on `/`, `/transactions`, `/analytics`, `/categories`, `/more`.
   - If needed, add a tiny client component that reapplies the saved theme on route changes, but first fix hydration root cause.

3. Fix amount/currency spacing.
   - File: `src/app/(dashboard)/transactions/TransactionsClient.tsx`
   - Ensure mobile and table rows render `-500 000 so'm`, never `-500 000so'm`.
   - Use a small currency span with margin or make the formatter return full money text.

### Phase 2 - Mobile record list polish
Goal: records should feel like a native finance list, not a cramped table.

- Increase edit/delete buttons to 44x44.
- Prefer a single overflow/action menu per row if two icons feel noisy.
- Keep amount right-aligned and signed.
- Row anatomy:
  - left: neutral icon tile, category name, type/date/note;
  - right: signed amount, then actions.
- Avoid thick row borders. Use subtle hairline dividers or card gaps, not harsh separators.
- Ensure FAB does not cover row actions or last rows.

### Phase 3 - Simplify analytics for mobile
Goal: analytics should help the owner understand, not impress with charts.

Recommended mobile layout:
1. Period segmented control.
2. One `Bu oy sof natija` card, then compact income/expense values.
3. `Xarajatlar qayerga ketdi` ranked category bars.
4. Optional trend chart below, only if readable.

Specific fixes:
- File: `src/app/(dashboard)/analytics/AnalyticsClient.tsx`
  - Change KPI grid to `grid-cols-1 sm:grid-cols-3` or a hero + two compact cards.
  - Prevent large money values from wrapping into ugly vertical stacks.
- File: `src/components/charts/CategoryPie.tsx`
  - On mobile, replace pie/legend with ranked bars.
  - Keep pie or richer chart only on larger screens.
- File: `src/components/charts/IncomeExpenseChart.tsx`
  - Replace hardcoded `#059669` and `#dc2626` with token-derived colors.
- File: `src/components/charts/TrendLine.tsx`
  - Replace hardcoded colors with tokens.
  - Reduce visual density on mobile.

### Phase 4 - Fix finance semantics on home
File: `src/app/page.tsx`

Current label risk:
- `UMUMIY BALANS` appears to show monthly net, not account balance.

Choose one:
1. If accounts are not implemented: rename hero label to `Bu oy sof natija` in all languages.
2. If accounts are implemented first: compute true account balance and keep `Umumiy balans`.

Do not keep ambiguous finance labels. Users should never wonder whether a number is cash balance, monthly profit, or net movement.

### Phase 5 - Adjust primary navigation
Files:
- `src/components/BottomNav.tsx`
- `src/components/TopNav.tsx`
- i18n dictionary

Recommended near-term nav:
- Home
- Records/Yozuvlar
- Analytics/Tahlil
- More/Yana

Move Debts and Accounts into More until implemented.

Acceptance:
- No bottom nav route lands on a "coming soon" page.
- The FAB remains the single add action.

### Phase 6 - Make settings honest
File: `src/app/(dashboard)/more/MoreClient.tsx`

For `Asosiy valyuta`:
- If implementing task 016 now: make it real and update every amount display.
- If not implementing task 016 now: make the row informational/disabled-looking and remove the chevron/accordion affordance.

Do not present fake controls.

### Phase 7 - Data safety UX
Already partly implemented:
- `src/components/TypedDeleteDialog.tsx`
- transactions and categories use it.

Polish:
- Use the same typed confirmation style for all destructive dashboard deletes.
- For high-risk deletes, show what will be affected:
  - record amount/category/date;
  - category linked records/budget warning;
  - budget removal warning.
- Required words:
  - uz: `o'chirish`
  - ru: `удалить`
  - en: `delete`
- Keep warning text direct and calm.

### Phase 8 - Visual system cleanup
Files likely touched:
- `src/app/globals.css`
- chart components
- dashboard pages

Design direction:
- Keep surfaces neutral and calm.
- Consider changing default theme from dark-first to system-first or light-first if user still says "yoqimli/sodda".
- Keep dark mode available and polished.
- Remove hardcoded hexes from chart components.
- Standardize radius and spacing:
  - card radius: 12-18px, consistent;
  - page padding: `px-4 sm:px-8`;
  - mobile bottom padding enough for bottom nav + FAB;
  - no random off-grid visual spacing unless inherited.

### Phase 9 - Bot and Telegram UX reliability pass
This is not pure visual design, but it directly affects the user experience and should be planned with the UI work.

Voice flow:
- When a voice message arrives, reply quickly that it is being processed if it may take more than a moment.
- Show the transcript back to the user: `Eshitdim: "..."`
- Then show the action: `Yozildi: -500 000 so'm, logistika, bugun.`
- If any required field is missing, ask exactly one clear question immediately.
- After saving, clearly mention edit/delete affordance: e.g. user can write `tuzat ...` or `o'chir`.
- Add tests for sliced audio buffers and mocked STT output.
- Keep production webhook protected from local polling conflicts.

Telegram WebApp/auth:
- Verify the bot has a real WebApp button when `APP_URL` is HTTPS.
- Verify Telegram Mini App opens dashboard and authenticates via validated initData.
- Keep a clean fallback path for ordinary browser users: bot deep link -> `/login` -> secure login/dashboard.
- Do not claim auto-message from website to bot; Telegram does not allow a normal website to send a bot message on behalf of the user.

Bot state:
- Separate pending clarification state from last-action/last-transaction state.
- Make edit/delete of the last transaction robust after a clarification or voice retry.

### Phase 10 - Data safety and finance model roadmap
Data safety:
- Add undo/restore or at least a soft-delete recovery path for transaction records.
- Consider export/download before destructive bulk actions.
- Add audit metadata for destructive actions.
- Keep typed confirmation for high-risk deletes.

Finance model:
- Implement accounts/cashboxes before using "Umumiy balans" as a true balance.
- Implement transfers separately from income/expense; transfers should not inflate income or expense.
- Implement debts/receivables only when they have a real list/detail/payment flow.
- Add counterparties and payment methods later if the product moves beyond assessment demo.

Production/ops:
- Add lightweight health/status page or admin command for bot/webhook.
- Add friendly user-facing failure messages for voice/login.
- Add rate limiting for expensive bot actions.
- Separate local and production databases if continuing beyond demo.

### Phase 11 - Backend hardening pass
Do this before calling the project production-ready.

Security:
- Add CSRF/origin protection to dashboard mutating APIs because session cookies may be `SameSite=None`.
- Add rate limits for:
  - magic token issuance/verification;
  - Telegram webhook user actions;
  - STT and Claude calls;
  - dashboard write APIs.
- Keep Telegram webhook secret validation; do not expose token values in logs.

Validation:
- Share one positive money parser/schema across transactions, budgets, and future currency code.
- Validate date strings explicitly as `YYYY-MM-DD` or ISO, then convert with a central Tashkent helper.
- Clamp pagination params.
- Return localized/user-friendly validation errors in UI where practical.

Data integrity:
- Prefer category archiving over hard delete.
- Add audit log entries for transaction edit/delete/category delete/budget changes.
- Add duplicate detection or at least a recent-duplicate warning for bot + quick add.

Performance:
- Move analytics aggregation toward DB groupBy queries instead of fetching all rows.
- Add server pagination/search for records before real usage.

### Phase 12 - Secretary/operator workflow roadmap
This is the "long-time kotiba" layer. It should be designed before adding more charts.

Add record fields or related models over time:
- counterparty: customer/vendor/person;
- payment method: cash/card/bank/click/payme/etc.;
- account/cashbox;
- document/receipt number;
- attachment URL or receipt image later;
- status: draft/confirmed/reviewed;
- operator note and owner note if team roles are added.

Add workflows:
- daily close/reconciliation;
- export CSV/XLSX/PDF;
- review queue for AI-created uncertain records;
- duplicate-review list;
- bulk edit for category/date/payment method corrections.

Do not overload the first UI. Add these as progressive disclosure under record detail, filters, and export/review screens.

### Phase 13 - Finance model roadmap
Before building "real business finance", decide and document:
- Cash-flow tracker vs full accounting.
- Cash basis vs accrual basis.
- Whether `income/expense` means paid money movement or recognized revenue/cost.

Then implement in this order:
1. Accounts/cashboxes with opening balance.
2. Transfers between accounts that do not affect income/expense totals.
3. Debts/receivables with payment status.
4. Counterparties and payment methods.
5. Reports/export/reconciliation.
6. Optional tax/VAT fields only if needed.

Never call a number "balance" unless it comes from accounts/cashboxes.

### Phase 14 - Shared date and money infrastructure
Create shared helpers before more UI work:
- `formatMoney(...)` for signed/unsigned money display.
- `formatDate(...)` deterministic for server/client.
- `getTashkentTodayString()`.
- `tashkentDateToUtcStart(...)`.
- `getTashkentPeriodBounds(...)`.

Acceptance:
- no duplicate local money/date formatter in major pages/components;
- server and client render the same strings;
- tests cover month boundary and today's date around UTC/Tashkent edge cases.

### Phase 15 - Assessment submission readiness
Before final submission, do a rubric pass against the exact Task 01 text.

Must visibly satisfy:
- Telegram text logging.
- Telegram voice logging.
- STT transcript or clear voice feedback.
- Intent detection: income, expense, report/question.
- Captures amount, type, category, date, optional note.
- Follow-up when unclear.
- Finance query answer.
- Correction/deletion of recent transaction.
- Custom category.
- Overview: income, expenses, net, period comparison, quick-add.
- Transactions: filters, search, inline edit/delete.
- Analytics: income vs expense, category breakdown, trends.
- Categories management.
- Onboarding empty state.
- Extra feature: monthly budget alerts.
- README, live bot username, live dashboard URL, product brief, 3-more-days paragraph, screen recording.

Submission polish:
- Put demo links and docs links near the top of README.
- Add a short "Assessment checklist" section with every requirement and where to see it.
- Make the product naming unambiguous: PulTrack/Oson Moliya.
- Explain the Claude/Groq vs OpenAI stack choice or switch to OpenAI-compatible providers before submitting.
- Record the demo after live deploy, not from localhost.
- Use a short, reliable voice phrase in Uzbek that is known to transcribe well.
- In the screen recording, show the dashboard update after the bot records the voice transaction.

Operational checklist before sending:
- Confirm GitHub repo access/visibility for the evaluator.
- Confirm live bot username opens the correct bot.
- Confirm live dashboard is not behind Vercel protection.
- Confirm Vercel deployment is the latest commit.
- Confirm webhook `last_error` is empty or the bot replies in a real Telegram chat.
- Confirm README links work in an incognito browser.
- Confirm no secrets are visible in repo/video/logs.
- Record the final demo from production, not localhost.

## Files to inspect before editing
- `docs/DESIGN.md`
- `docs/tasks/015-kissa-ia-redesign.md`
- `src/app/globals.css`
- `src/app/layout.tsx`
- `src/components/ThemeToggle.tsx`
- `src/components/BottomNav.tsx`
- `src/components/TopNav.tsx`
- `src/components/AddSheet.tsx`
- `src/app/page.tsx`
- `src/app/(dashboard)/transactions/page.tsx`
- `src/app/(dashboard)/transactions/TransactionsClient.tsx`
- `src/app/(dashboard)/analytics/AnalyticsClient.tsx`
- `src/components/charts/CategoryPie.tsx`
- `src/components/charts/IncomeExpenseChart.tsx`
- `src/components/charts/TrendLine.tsx`
- `src/app/(dashboard)/more/MoreClient.tsx`
- `src/lib/i18n/dictionaries.ts`

## Browser QA checklist
Use authenticated demo data.

Mobile width around 375-390:
- `/`: no overflow, hero label is semantically correct, recent rows readable, FAB not covering key text.
- `/transactions`: no hydration console errors, theme consistent, no `so'm` spacing bug, row actions are tappable.
- `/analytics`: no chart label concatenation, money values do not wrap badly, bars/charts readable.
- `/categories`: typed delete and budget text readable.
- `/more`: settings rows honest; theme/language work.

Desktop:
- `/`: content uses width well but does not feel stretched.
- `/transactions`: table readable; money right-aligned; action buttons accessible.
- `/analytics`: charts readable without clutter.

Console:
- no React hydration mismatch;
- no uncaught errors;
- Telegram SDK logs are okay if harmless.

Automated checks:
- detect horizontal overflow:
  - `document.documentElement.scrollWidth <= document.documentElement.clientWidth`
- detect tiny visible interactive targets:
  - buttons/links should generally be 44px high/wide on mobile, except inline text links.

## Gates
PowerShell prefix:
`$env:Path = "C:\Program Files\nodejs;" + $env:Path`

Required before done:
- `npm run typecheck`
- `npm test`
- `npm run build`

If deploying:
- Use the existing deploy method documented in `docs/STATE.md`: `npx vercel --prod --yes`.
- After deploy, verify live URL `https://oson-moliya.vercel.app`.
- Do not print secrets or tokens.
- Telegram bot/token/webhook changes are not part of this UI task unless explicitly requested.

## Acceptance criteria
1. No hydration mismatch on `/transactions`.
2. Theme is consistent across all dashboard routes.
3. Mobile transaction rows show spaced, signed money and tappable actions.
4. Analytics mobile is simplified and readable; no concatenated chart labels.
5. Bottom nav contains only working primary flows, or any unfinished route is intentionally hidden in More.
6. Home hero label accurately describes the number shown.
7. Currency settings row is either real or visually honest.
8. All visible copy is present in uz/ru/en.
9. No hardcoded chart hex colors remain in chart components.
10. Browser QA passes on mobile and desktop.
11. Typecheck, tests, and build pass.
12. If user asked for live release, prod deploy is verified after changes.

## Suggested commit shape
Keep this as one focused UI/UX task commit if possible:
- `fix(ui): repair dashboard UX and finance semantics`

If the change grows too large, split into:
1. `fix(ui): resolve transactions hydration and theme issues`
2. `feat(ui): simplify mobile analytics and nav`
3. `chore(ui): codify design contract`

## Suggested final report to user
Use plain Uzbek/English mix:
- what was fixed;
- what gates passed;
- what was deployed or not deployed;
- where to verify;
- any risk left.

Do not overwhelm the user with implementation jargon.
