# TASK 003 — Phase 3: Analytics, Categories, Onboarding, Budget alerts, full i18n, Transactions filters

**Prereq:** Phases 1–2 merged & gates green. Read `CLAUDE.md`, `docs/STATE.md`, `docs/PLAN_REVIEW.md`,
and **`docs/DESIGN.md` (MANDATORY — the UI/UX bar; follow the color tokens, typography, component
patterns, required empty/loading/error states, mobile-first, and polish rules exactly)**.
Same hard constraints. This phase makes the dashboard feel like a real, professional tool (the task's
explicit UX bar, graded) and ships the chosen extra feature (budget alerts). Also REFINE the Phase-1
Overview + Transactions pages to match `docs/DESIGN.md` (Phase 1 shipped them functional, not polished).

## 1. Analytics page — `src/app/(dashboard)/analytics/page.tsx` + `GET /api/analytics`
- `GET /api/analytics?from&to&groupBy` → returns series for charts (BigInt→string/number).
- Recharts (client components in `src/components/charts/`):
  - `IncomeExpenseChart` — income vs expense for the selected period (bar or grouped bar).
  - `CategoryPie` — expense breakdown by category.
  - `TrendLine` — net (or income/expense) over time (groupBy day/month, Asia/Tashkent buckets).
- Period selector (this month / last month / this year / custom). Empty-data state per chart.

## 2. Categories page — `src/app/(dashboard)/categories/page.tsx` + `/api/categories` (+ `[id]`)
- List income & expense categories (defaults + custom). Create / rename / delete (delete sets tx
  categoryId null via SetNull; block deleting a category with a budget unless confirmed). Owner-guarded.
- Per-category **monthly budget limit** input (income categories have no budget). Saves to `Budget`.

## 3. Budget alerts (the +1 feature) — `src/lib/services/budgets.ts`
- `getBudgets(userId)` / `upsertBudget(userId, categoryId, limitUzs)`.
- `checkBreach(userId, categoryId)` called INLINE right after an expense is logged (bot path): sum this
  month's expense for that category (Asia/Tashkent) using the `[userId,categoryId,occurredAt]` index; if
  `sum >= limit` AND `lastAlertedYm !== currentYm` → send a proactive bot message
  ("⚠️ <category> oylik byudjeti (<limit>) oshib ketdi. Hozirgi: <sum>.") and set `lastAlertedYm = currentYm`
  (one alert per category per month — idempotent).
- Dashboard: budget progress bars per category (green/amber/red; >100% red) on Overview and/or Categories.

## 4. Onboarding — `src/app/(dashboard)/onboarding/page.tsx`
- Shown when the user has zero transactions (verify route redirects new users here). Friendly empty state
  that explains the bot (with example messages) and a "open your bot" deep link. Overview/Transactions
  empty states also guide the first action (not blank tables).

## 5. Transactions page — finish the required UX
- Filters (type, category, date range) + text search over note/category + pagination.
- **Inline edit & delete** rows (calls `PATCH`/`DELETE /api/transactions/[id]`). Optimistic UI ok.

## 6. Full i18n (uz / ru / en)
- Complete and proofread RU and EN dictionaries for ALL dashboard strings (not mirrors of UZ). Number/
  currency formatting localized ("1 200 000 so'm"). `<LangSwitcher>` present on every page; persists via
  the `pultrack_lang` cookie. Bot replies remain per-message language (independent of dashboard).

## Acceptance criteria
1. `npm run typecheck` + `npm test` + `npm run build` green (no live DB needed for build).
2. `tests/budget.test.ts`: under limit → no alert; crossing → one alert; second expense same month → no
   second alert (lastAlertedYm guard); new month → alerts again.
3. Charts render from `/api/analytics`; Categories CRUD + budget limits work; onboarding + empty states
   present; Transactions filters/search/inline-edit/delete work; all three languages complete.
4. Professional, consistent visual language (clear hierarchy, spacing, touch targets) — this is graded.
5. No git/commit/deploy/secrets.

## Final report
Files changed; gate results; screenshots-worthy states; any UX trade-offs; risks for the reviewer.
