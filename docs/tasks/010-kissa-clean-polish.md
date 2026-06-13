# TASK 010 — "Kissa-clean" UI polish (simplicity pass)

**Goal:** make the dashboard as clean & simple as Kissa (kissa.w2w.uz), keeping our warm-minimal light+dark
tokens. Reference: Kissa screenshots — rounded icon-tile list rows, green/red summary cards, chip filters,
rounded search, and a **mobile bottom-tab nav**. Apply to existing pages; the new Debts/Accounts modules
(tasks 008/009) will reuse these patterns. Read `docs/DESIGN.md`. Use the `var(--color-*)` tokens (light+dark).

## 1. Mobile bottom-tab navigation (Kissa-style) — `src/components/BottomNav.tsx` (new, client)
- On screens `< sm`: a FIXED bottom bar (`fixed bottom-0 inset-x-0`), surface bg + hairline top border,
  4–6 tabs with icon + tiny label, active tab in `--color-brand`. Tabs = the nav routes
  (Umumiy `/`, Harakatlar `/transactions`, Tahlil `/analytics`, Kategoriyalar `/categories`;
  later Qarzlar/Hisoblar will be added by 008/009). Safe-area padding at the bottom.
- `TopNav`: on `< sm`, HIDE the hamburger menu + nav links (BottomNav replaces them); keep the brand +
  ThemeToggle + LangSwitcher in a slim top bar. On `>= sm`, keep the current top nav (desktop unchanged).
- Add bottom padding to page content on mobile so the bottom bar doesn't cover the last rows (`pb-20 sm:pb-8`).

## 2. Category rows — clean icon-tile list (`(dashboard)/categories/CategoriesClient.tsx`)
- Each category row: a rounded icon tile (44px, `rounded-xl`, bg `--color-income-bg`/`--color-expense-bg`,
  containing the emoji OR a ↗/↘ arrow in income/expense color) + the name (medium weight) + right-side actions
  (edit/delete, and the budget chip for expense). Row = card-like, generous padding, hairline separation.
- Income/Expense as a top **segmented toggle** (Xarajat | Daromad), like Kissa. "New category" as a clean
  add-row with a + at the top of each list.

## 3. Transactions — chip filters + rounded search + summary cards (`(dashboard)/transactions/TransactionsClient.tsx`)
- A rounded search input with a leading 🔍 icon (full-width, `rounded-[12px]`, `--color-surface-2` bg).
- Filters as **chips** (rounded pill buttons with a caret): period, category, type — Kissa "Bu oy / Hisoblar /
  Barchasi" style. Keep current filter logic; restyle the controls as chips.
- Two summary cards above the list: **DAROMAD** (green, `--color-income`) and **XARAJAT** (red,
  `--color-expense`) totals for the current filter — uppercase muted label + big tabular number.

## 4. Global softening
- Card radius → `12px` (slightly softer than 10px, closer to Kissa) — update cards/inputs/buttons consistently
  (you may bump `--radius` to 12px in globals.css if components read it, else adjust the rounded-[10px] usages).
- A touch more whitespace; keep flat (no shadows), hairline borders, calm. Empty states centered + muted (Kissa-like).
- Verify everything still reads well in BOTH light and dark.

## Constraints / gates
PowerShell PATH prefix. No new deps. Don't touch `.env`, `prisma/schema.prisma`, `src/lib/types.ts`. Keep all
three languages. typecheck + test + build green. **Also**: avoid event handlers in server components (use CSS
`:hover` / client components) — a prior bug. Commit `feat(ui): Kissa-clean polish — mobile bottom-tab nav, icon-tile categories, chip filters`.
