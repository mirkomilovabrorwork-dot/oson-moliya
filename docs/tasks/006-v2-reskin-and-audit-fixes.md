# TASK 006 — v2 warm-minimal reskin + QA audit fixes

**Context:** A read-only senior audit found a P0 (UI was fully unstyled — tokens undefined) plus correctness/
security/polish issues. The P0 token fix is already done in `globals.css` (warm-minimal v2 palette, existing
token names kept). Now: (A) apply the v2 **look & feel** across components per `docs/DESIGN.md` (v2), and
(B) fix the audit findings below. Read `docs/DESIGN.md`, `CLAUDE.md`, `src/lib/types.ts` first.

Single agent, whole working tree (no other agent runs concurrently). Same hard constraints (PowerShell PATH
prefix; no real secrets; do not modify `.env`, `prisma/schema.prisma`, `src/lib/types.ts`). Gates at the end.

## A. v2 reskin (per docs/DESIGN.md — warm-minimal, Claude.ai/Readwise/shadcn)
Tokens are defined in `globals.css` (use the `var(--color-*)` names; `.tabular` exists). Across ALL dashboard
pages + components (`src/app/page.tsx`, `(dashboard)/**`, `login`, `onboarding`, `src/components/**`):
- **Remove drop shadows** → use a 1px hairline `border` in `var(--color-border)` (at most a barely-there
  `0 1px 2px rgba(0,0,0,.03)`). Flat, calm, paper-like.
- **More whitespace:** cards `p-6`, section `gap-6/8`, page centered `max-w-5xl` with `px-5 sm:px-8 py-8`.
- **Radius** `10px` (rounded-[10px]); pills fully rounded; no over-rounding.
- **Stat cards:** muted caption + big `tabular` number + small subtle ▲/▼ delta (income/expense color, not loud).
- **Tables:** header bg `--color-surface-2`, hairline row borders, hover `--color-surface-2`, ≥44px rows,
  right-aligned `tabular` amounts, type as a small colored text/dot (NOT loud filled pills).
- **Buttons:** primary `bg-[--color-brand] text-white` (hover `--color-brand-hover`), secondary = border only.
  One primary per view. Focus-visible ring in brand. Inputs `h-11`, border, focus ring.
- **TopNav:** paper bg + hairline bottom border (no shadow); brand "Oson Moliya" in `--color-text-primary`
  (calm, not loud); active nav link in `--color-brand` (text or `--color-brand-light` pill); LangSwitcher minimal.
- **Charts (Recharts):** income `#3f7d5a`, expense `#b5453b` (literal hex is OK in SVG — add a comment that
  these mirror the tokens), light grid, formatted-money tooltips, calm per-chart empty state.
- **Budget bars:** thin `--color-surface-2` track, fill by threshold (ok/warn/over tokens), `tabular` labels.
- **States:** calm empty (small glyph + warm line + quiet CTA), skeleton loading in `--color-surface-2`, friendly error.
- No gradients/neon/glassmorphism; no cold pure-gray; keep all three languages, no RU overflow.

## B. Audit fixes (apply exactly; skip none unless noted)
1. **P1-1** `(dashboard)/analytics/AnalyticsClient.tsx` `getThisYear()`: the `to` date is treated as EXCLUSIVE
   by the API, so today is dropped. Set `to` = tomorrow's Tashkent date (now + 1 day) so today is included.
2. **P1-2** `(dashboard)/transactions/TransactionsClient.tsx` (~107–108): the date filter compares the UTC ISO
   `occurredAt` against `dateTo + "T23:59:59Z"`, which misclassifies Tashkent-day boundaries. Compare on the
   Tashkent *date* (convert occurredAt to Asia/Tashkent YYYY-MM-DD, then string-compare to from/to).
3. **P1-3** `src/lib/env.ts`: `AUTH_SECRET` is required but never used → makes deploy fail needlessly. Make it
   `.optional()` (sessions are secure via random+DB). Leave `.env.example` as-is.
4. **P1-4** `src/app/api/auth/logout/route.ts`: change logout from `GET` to `POST` (CSRF). Update `TopNav.tsx`
   (desktop + mobile) to use a `<button>` that does `fetch('/api/auth/logout',{method:'POST'})` then
   `location.href='/login'`. Keep `/api/auth/verify` as GET (it's a magic-link click).
5. **P1-5** `src/lib/telegram/reply.ts` `formatAmount`: replace `toLocaleString("uz-UZ")` with the manual
   space-grouping formatter used elsewhere (reliable on Vercel/Node), keep `+ " so'm"`.
6. **P1-6** chart components (`IncomeExpenseChart/CategoryPie/TrendLine`): tooltips call `.toLocaleString()`
   with no locale → may show commas on Vercel. Use the manual `formatMoney`/space-group formatter instead.
7. **P1-7** `src/lib/telegram/bot.ts` + `src/lib/claude/brain.ts`: after a logged tx, a `PendingAction` with
   `intent:"logged"`, `question:""` is written, and brain.ts then injects an empty "user was asked: ''" context
   into EVERY following message. Fix: do NOT inject pending context unless `pending.intent === "clarify_needed"`
   (or clear/skip the "logged" pending before re-querying the brain). The `lastTransactionId` it carries must
   still be available for correct/delete "last" targeting — keep that working.
8. **P2-1** `src/app/layout.tsx`: metadata title/description still "Create Next App" → set to
   `"Oson Moliya — Biznes moliyasi"` / a short Uzbek description.
9. **P2-6** `(dashboard)/categories/CategoriesClient.tsx` (~192): the income section "New category" button uses
   `list[0]?.type` (wrong/undefined when empty → defaults expense). Pass the section type explicitly
   ("income"/"expense") to the add handler.
10. **P2-7** `src/app/page.tsx` Overview: budget DTOs use N+1 `aggregate` per budget. Replace with a single
    `groupBy` (mirror `/api/budgets`) for this month's per-category expense.
11. **P2-8** Add `src/app/error.tsx` and `src/app/not-found.tsx` — on-brand (tokens), friendly message + a link
    home / retry. No raw stack traces.

**Do NOT change:** the Telegram webhook returning 401 on a bad/missing secret token
(`src/app/api/telegram/route.ts`) — that is CORRECT (legitimate Telegram requests always carry the secret and
get 200; only forged requests get 401). The "always 200" rule applies to the processing/error path, which is
already correct. This was an audit false-positive.

## Gates (must pass)
`npm run typecheck` + `npm test` + `npm run build`. Redirect long output to a temp log; read it. Fix failures.
Do NOT start a dev server or bot (none should be running; the reviewer will).

## Finish
Commit: `git add -A && git commit -m "feat(ui): warm-minimal v2 reskin + audit fixes (P1/P2)"`. Do NOT push.
Report: files changed, gate results, which audit items done, anything deferred, and notes for the reviewer's
visual check.
