# Task 017 - Claude execution plan

This is the short plan Claude should follow first. The full audit/reference is in
`docs/tasks/017-ui-ux-finance-design-plan.md`.

## Goal

Make Oson Moliya/PulTrack pass the Data365 assessment as a reliable finance product demo:
Telegram voice/text -> bot understands or asks follow-up -> record is saved -> dashboard updates -> user can edit/delete safely.

Do not overbuild. Prioritize the rubric and the live demo path.

## Who will judge it

1. Recruiter/coordinator: checks README, links, bot, dashboard, video.
2. Technical evaluator: runs setup/tests/build, checks auth/API/AI glue and repo cleanliness.
3. Product/agency evaluator: checks whether this solves a real Uzbek SMB money-tracking workflow.
4. QA tester: sends unclear/duplicate/noisy voice messages and tries mobile UI.
5. SMB owner/bookkeeper: checks whether money numbers are trustworthy and easy to correct.
6. Vibe-coding hiring manager: checks judgment, tradeoffs, shipped quality, and honest limitations.
7. Rubric-literal reviewer: compares every task bullet against the app and README.

Conclusion: this project will not fail because it lacks more features. It will fail if the required demo path is flaky, confusing, or not visible.

## P0 - Must fix before deploy/submission

1. Make `/transactions` stable.
   - Fix React hydration mismatch from locale/date formatting.
   - Ensure theme does not drop on `/transactions`.
   - Fix mobile money spacing: `-500 000 so'm`, not `-500 000so'm`.
   - Row actions must be at least 44x44 and not covered by FAB.

2. Make the exact assessment flow boringly reliable.
   - Voice message starts with immediate feedback like "Ovozingizni matnga aylantiryapman..."
   - STT transcript is shown or summarized.
   - AI saves only when amount/type/category/date are clear.
   - If unclear, bot asks one direct follow-up and does not silently save.
   - Recent edit/delete works after voice and text records.
   - Dashboard visibly shows the new record after bot save.

3. Align the product with the rubric.
   - README top block: GitHub, live dashboard, live bot, screen recording, product brief, 3-more-days paragraph.
   - Explain naming clearly: "PulTrack, shipped as Oson Moliya for Uzbek users."
   - Overview must visibly include income, expense, net, period comparison, and quick-add access.
   - Budget alert must be demonstrable, not only mentioned.
   - Onboarding/fresh-user path must work.

4. Remove misleading finance wording.
   - Do not call current-period net "Umumiy balans" unless true accounts/opening balances exist.
   - Use wording like "Bu oy natijasi", "Sof harakat", or "Kirim - chiqim".
   - State clearly that this MVP is cash-flow tracking, not full accounting.

5. Verify live production, not only local.
   - Run required gates: `npm run typecheck`, `npm test`, `npm run build`.
   - Deploy with the repo's documented Vercel CLI path if code changed and user asked to go live.
   - After deploy, test the real Telegram bot and real dashboard URL once end-to-end.

## P1 - Important polish

1. Simplify mobile analytics.
   - Prefer ranked category bars over pie labels on small screens.
   - Prevent KPI numbers from wrapping awkwardly.
   - Add list/text alternatives for charts.

2. Clean navigation.
   - Do not put unfinished routes like `Qarzlar` in primary nav unless it is intentionally shown as roadmap.
   - Primary mobile nav should lead to working, useful pages.

3. Make settings honest.
   - If currency is only UZS, show it as informational.
   - If multi-currency is implemented later, follow `docs/tasks/016-multi-currency.md`.

4. Standardize formatting.
   - Create shared money/date/period helpers.
   - Use Tashkent-local finance dates consistently.
   - Avoid duplicated formatter logic in pages/components.

5. Improve data safety.
   - Keep typed delete confirmation in the current UI language.
   - Add clear warning copy before delete.
   - Plan undo/export/audit-log later; do not pretend they exist.

## P2 - Roadmap, not assessment blocker

1. Accounts/cashboxes and transfers.
2. Debts/receivables as real ledgers.
3. Counterparty, payment method, receipt/attachment, status, operator note.
4. Daily close/reconciliation flow.
5. CSV/Excel/PDF export for accountant handoff.
6. Role/team access.
7. Category soft-delete or category-name snapshot for historical records.
8. Rate limits, CSRF/origin protection, better observability, and session management.

## Design contract for future UI updates

1. Keep it simple, pleasant, mobile-first, Uzbek-first.
2. Finance clarity beats visual decoration.
3. Green means income/positive, red means expense/destructive, accent means action.
4. Money is signed, spaced, tabular, and right-aligned in lists.
5. Touch targets are at least 44x44.
6. Do not use decorative gradients/glows/glass/rainbow cards.
7. Do not show fake controls or unfinished modules as if they work.
8. Empty/error states must tell the user the next action.

## Browser QA checklist

Check mobile and desktop:
- `/`
- `/transactions`
- `/analytics`
- `/categories`
- `/more`
- login/onboarding/fresh user

Pass criteria:
- no hydration errors;
- no horizontal overflow;
- no overlapping text/buttons/FAB;
- clear money signs and spacing;
- clear delete confirmation;
- fresh bot record appears on dashboard;
- README/demo links are correct.

