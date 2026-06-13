# Task 015 — Kissa-style IA redesign: nav + FAB + "Yana" settings + Home summary + polish

## Goal
Restructure the dashboard's information architecture and visual design to match the **Kissa**
reference app (kissa.w2w.uz): a clean, premium-but-simple, **dark-first** finance app
(charcoal surfaces + sky-blue accent — already in `globals.css` v5). Keep it **simple and
convenient**. Trilingual (uz/ru/en). **No business-logic / API / bot changes.**

## Approved scope (user chose "Struktura + Yana + sayqal")
1. **Bottom nav** → 4 tabs **Bosh sahifa / Harakatlar / Qarzlar / Yana** + a floating **"+" FAB** (bottom-right).
2. **New "Yana" (More) settings page** holding: Hisoblar · Kategoriyalar · Asosiy valyuta · **Til** · **Mavzu** · Chiqish.
   → **MOVE the theme toggle and language switcher OUT of `TopNav` and INTO this page.**
3. **Home** becomes a Kissa-style **summary**: balance/net hero → expense-overview donut (→ Tahlil) → recent transactions → budget bars.
4. **Qarzlar (Debts)** and **Hisoblar (Accounts)** = clean **"Tez orada" (coming soon)** placeholder pages for now.
5. **Polish**: one consistent radius/shadow/spacing system; clean cards; strong hierarchy; good contrast.

## NON-NEGOTIABLE: do NOT touch
- Any `src/app/api/**`, `src/lib/services/**`, `src/lib/telegram/**`, `src/lib/auth/**`, `prisma/**`, bot, parser, brain.
- Money/date logic. Keep using existing server queries + `t(key, lang)` i18n + `resolveLang`.
- Do NOT add npm deps (no shadcn, no icon libs). Use inline SVGs + Tailwind + the existing CSS-var tokens.
- Do NOT commit / touch git / edit `docs/STATE.md` / `.env`.

---

## SHARED VISUAL LANGUAGE (coherence contract — EVERY screen must follow this)
Dark-first; use ONLY existing tokens (`var(--bg/--surface/--surface-sunken/--fg/--fg-muted/--fg-subtle/--border/--accent/--accent-wash/--income/--expense/--radius-*/--shadow-*)`).

- **Card:** `background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg)` (18px). Inner padding `p-4` (mobile) / `p-5` (sm+). Use `--shadow-sm` only on raised/floating elements (FAB, sheet), NOT on flat cards (borders over shadows).
- **Section label** (e.g. "XARAJATLAR SHARHI"): `text-xs font-semibold uppercase tracking-wide` color `var(--fg-subtle)`, margin-bottom `0.5rem`, padding-left `0.25rem`.
- **List row** (settings rows, tx rows): height ≥ 56px, `px-4 py-3.5`, between rows a `1px solid var(--border)` divider (not after the last). Left: a **`w-9 h-9 rounded-[12px]`** icon tile with a soft colored wash bg + the glyph; then title (`text-sm font-medium var(--fg)`) over optional subtitle (`text-xs var(--fg-subtle)`). Right: a value (`text-sm var(--fg-muted)`) and/or a chevron `›` (`var(--fg-subtle)`).
- **Money:** `.tabular`; income `var(--income)` with `+`, expense `var(--expense)` with `−` (U+2212), space-grouped thousands + " so'm".
- **Spacing rhythm:** page vertical gap between sections = `space-y-5` (mobile) / `space-y-6` (sm+); page horizontal padding `px-4 sm:px-8`; **add `pb-28` on mobile** so content clears the bottom nav + FAB.
- **Active accent:** active nav/segment = `color: var(--accent)` with `background: var(--accent-wash)`. Never use raw gradients.
- **Icon-tile wash colors** (settings rows): accounts→`var(--income-wash)`/income glyph; categories→`var(--accent-wash)`; currency→`var(--accent-wash)`; language→`var(--accent-wash)`; theme→`var(--surface-sunken)`. Keep glyphs as simple inline SVG strokes, `stroke="currentColor"`.

---

## i18n keys to ADD (foundation owns this — add to ALL THREE dicts in `src/lib/i18n/dictionaries.ts`)
| key | uz | ru | en |
|---|---|---|---|
| `nav.home` | Bosh sahifa | Главная | Home |
| `nav.debts` | Qarzlar | Долги | Debts |
| `nav.more` | Yana | Ещё | More |
| `more.title` | Sozlamalar va asboblar | Настройки и инструменты | Settings & tools |
| `more.accounts` | Hisoblar | Счета | Accounts |
| `more.accounts_sub` | Hisoblarni boshqarish | Управление счетами | Manage accounts |
| `more.categories_sub` | Kategoriyalarni boshqarish | Управление категориями | Manage categories |
| `more.currency` | Asosiy valyuta | Основная валюта | Main currency |
| `more.currency_sub` | Asosiy valyutani tanlash | Выбор основной валюты | Choose main currency |
| `more.language` | Til | Язык | Language |
| `more.language_sub` | Tilni tanlash | Выбор языка | Choose language |
| `more.theme_sub` | Yorug', qorong'i yoki tizim | Светлая, тёмная или системная | Light, dark or system |
| `common.soon` | Tez orada | Скоро | Coming soon |
| `home.balance` | Umumiy balans | Общий баланс | Total balance |
| `home.expense_overview` | Xarajatlar sharhi | Обзор расходов | Expense overview |
| `home.total` | Jami | Всего | Total |
| `home.more` | Ko'proq | Подробнее | More |
| `debts.soon_desc` | Qarzlar moduli tez orada qo'shiladi. | Модуль долгов появится скоро. | The debts module is coming soon. |
| `accounts.soon_desc` | Hisoblar moduli tez orada qo'shiladi. | Модуль счетов появится скоро. | The accounts module is coming soon. |
Reuse existing keys where present: `nav.transactions`, `nav.categories` (for the Kategoriyalar row), `nav.theme` (Mavzu), `nav.logout` (Chiqish), `theme.*`, `overview.*`.

---

## FOUNDATION phase (one agent, sequential — shared/coupled files)
1. **`src/lib/i18n/dictionaries.ts`** — add ALL keys above to uz, ru, en (same key set in each).
2. **`src/components/BottomNav.tsx`** — 4 tabs: `/`→`nav.home` (IconHome), `/transactions`→`nav.transactions` (IconTransactions), `/debts`→`nav.debts` (IconDebts: a hand/coins glyph), `/more`→`nav.more` (IconMore: three dots). Keep mobile-only (`sm:hidden`), safe-area padding, active = accent + accent-wash tile (existing pattern). Remove the Analytics/Categories tabs.
3. **`src/components/AddSheet.tsx`** (NEW, client) — a floating circular **FAB** (`fixed`, bottom-right, `bottom: calc(env(safe-area-inset-bottom) + 76px)` on mobile so it sits above the nav; `sm:bottom-8`; `right-4 sm:right-8`; `w-14 h-14 rounded-full bg-[var(--accent)] text-white shadow-lg`, big "+" SVG, `aria-label` from `overview.quick_add`). On click → opens a bottom-sheet/modal (overlay `rgba(0,0,0,.5)`, panel `var(--surface)`, rounded top `var(--radius-lg)`, slides up; on sm+ center it). The panel lazy-loads categories via `GET /api/categories` on first open, then renders the existing **`QuickAddForm`** (`lang`, fetched `categories`, `onSuccess`= close sheet + `router.refresh()`). Handle loading + the `/api/categories` response shape (read the route/QuickAddForm to match the `{id,name,type,emoji}` shape; map if needed). Close on overlay click + Esc + a header ✕.
4. **`src/components/TopNav.tsx`** — REMOVE `ThemeToggle` + `LangSwitcher` + the inline logout. Desktop nav links become `/`→`nav.home`, `/transactions`, `/debts`→`nav.debts`, `/more`→`nav.more`. Keep brand "Oson Moliya". (Theme/lang/logout now live only on the Yana page.)
5. **`src/app/globals.css`** — light polish only: ensure `--radius-lg` reads 18px (keep), add nothing that breaks tokens. (Most styling is inline via tokens.) Optional: a `.section-label` helper utility matching the contract above — optional, inline is fine.

## PAGES phase (parallel after foundation — isolated files; each MUST follow the SHARED VISUAL LANGUAGE)
### A. `src/app/(dashboard)/more/page.tsx` (NEW) + `src/app/(dashboard)/more/MoreClient.tsx` (NEW, client)
Server page: `getSessionUser()` (redirect `/login` if none), `resolveLang`, render `<TopNav lang/>` + `<BottomNav lang/>` + `<AddSheet lang/>` + a `<main class="max-w-2xl mx-auto px-4 sm:px-8 py-6 pb-28 space-y-5">`.
Header: `<h1>` = `more.title` (style like Kissa "Sozlamalar va asboblar", muted).
A single settings **card** with rows (follow List-row pattern), in this order:
1. **Hisoblar** (`more.accounts` / `more.accounts_sub`) → `Link` to `/accounts`, chevron.
2. **Kategoriyalar** (`nav.categories` / `more.categories_sub`) → `Link` to `/categories`, chevron.
3. **Asosiy valyuta** (`more.currency` / `more.currency_sub`) → right value **"UZS"** (static for now), chevron (non-interactive or disabled-looking; no action needed).
4. **Til** (`more.language` / `more.language_sub`) → right shows current lang label; tapping reveals/contains the **`LangSwitcher`** (segmented uz/ru/en) — render `LangSwitcher` inline in/under this row (client). 
5. **Mavzu** (`nav.theme` / `more.theme_sub`) → contains the **`ThemeToggle`** (segmented light/dark/system) inline in/under this row.
   (Rows 4 & 5 must actually let the user change language/theme — reuse the existing client components; this is the headline requirement.)
Below the card: a full-width **Chiqish** button (red, `var(--expense)` text on `var(--expense-wash)`, rounded `--radius-lg`, `py-3.5`) that POSTs `/api/auth/logout` then `location.href="/login"` (same logic as the old TopNav logout). `MoreClient` holds the interactive bits (LangSwitcher/ThemeToggle/logout); the server page composes layout + nav.

### B. `src/app/page.tsx` (Home — REWRITE the content, keep the data fetching)
Keep ALL existing server data fetching (overview, recent, budgets). ADD: an expense-by-category aggregation for the current Tashkent month (`groupBy categoryId where type=expense, deletedAt:null, occurredAt in month`) joined to category names → feed the donut. Render `<TopNav/><BottomNav/><AddSheet/>` + `<main class="max-w-2xl mx-auto px-4 sm:px-8 py-6 pb-28 space-y-5">` (single column, summary):
1. **Balance hero card:** label `home.balance` (uppercase subtle) + big `text-3xl font-bold` net (`overview.net`, this month) with sign/color; below it two inline mini-stats: Daromad (`+income`, income color) and Xarajat (`−expense`, expense color).
2. **Expense-overview card:** section label `home.expense_overview`; a **donut** (reuse `src/components/charts/CategoryPie.tsx` with the expense-by-category data; if it needs a wrapper, pass the data shape it expects — read the component) with `home.total` + total expense in the center; a `home.more →` Link to `/analytics`. If no expense this month → a small muted empty hint (reuse `empty.overview` style).
3. **Recent transactions card:** keep the existing recent-list markup (icon tile + name/date + signed amount) and the empty-state; header `overview.recent` + `overview.view_all →` to `/transactions`.
4. **Budget bars card:** keep existing `BudgetBar` block (only if `budgetDTOs.length>0`); header `overview.budget_alerts` + edit→ `/categories`.
REMOVE the inline `QuickAddForm` sidebar (adding is now via the FAB/AddSheet). Remove the old 3-up StatCard grid (replaced by the hero). Keep imports tidy.

### C. `src/app/(dashboard)/debts/page.tsx` (NEW) and `src/app/(dashboard)/accounts/page.tsx` (NEW)
Each: server page, auth-guard + `resolveLang`, render `<TopNav/><BottomNav/><AddSheet/>` + a centered **coming-soon** state inside `<main ... pb-28>`: an icon tile, an `<h1>` (Qarzlar / Hisoblar via `nav.debts` / `more.accounts`), a muted line (`debts.soon_desc` / `accounts.soon_desc`), and a small `common.soon` pill/badge. Keep it on-brand and tidy (this is shown to a grader).

---

## Acceptance criteria
1. Mobile bottom nav shows exactly **Bosh sahifa / Harakatlar / Qarzlar / Yana**; active tab uses accent+wash; a floating **"+" FAB** opens an add-transaction sheet that successfully creates a transaction (then refreshes).
2. **Theme and language are NO LONGER in `TopNav`**; they are on **/more** and actually work (changing theme repaints; changing language re-renders text).
3. `/more` lists Hisoblar, Kategoriyalar, Asosiy valyuta(UZS), Til, Mavzu, and a red Chiqish that logs out.
4. Home is a single-column summary (balance hero + expense donut + recent + budgets); no inline quick-add form; no 500s.
5. `/debts` and `/accounts` render tidy "Tez orada" pages.
6. All new/visible text is translated in **uz/ru/en** (no missing-key fallbacks).
7. Visually coherent across all screens per the SHARED VISUAL LANGUAGE (consistent radius/spacing/cards). Dark-first looks like a polished paid app; light theme still works.
8. Gates green.

## Gate commands (must be green before "done")
PowerShell: `$env:Path = "C:\Program Files\nodejs;" + $env:Path`, then capture to logs:
`npm run typecheck *> tc.log` · `npm test *> test.log` · `npm run build *> build.log` (read the logs; do NOT pipe through tail). All exit 0.

## Final report
Files created/changed; the pass/fail summary line from each gate (paste real output); any deviations; confirm you did NOT touch APIs/services/bot/auth/prisma/git/STATE/.env or add deps.
