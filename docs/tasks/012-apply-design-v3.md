# TASK 012 — Apply DESIGN v3 across the app (professional, anti-AI-slop re-skin)

**Goal:** make the whole web app match `docs/DESIGN.md` (v3) — calm, professional, human-designed; one rationed
terracotta accent, warm neutral ramp, borders-over-shadows, tabular money, Inter 440/540/620, refined dark.
This is a thorough re-skin. Read **`docs/DESIGN.md` (v3) fully** first, plus `CLAUDE.md`. Use Next 16 docs as needed.

Single agent, main tree. Gates must pass. Do NOT touch `.env`, `prisma/schema.prisma`, `src/lib/types.ts`, the
bot/services/API logic (this is presentation only: `src/app/**` pages/layout, `src/components/**`, `src/app/globals.css`,
`src/lib/i18n` for any new labels). No new deps. No event handlers in server components (use CSS / client comps).

## Step 1 — globals.css → v3 token system (exact)
Rewrite `src/app/globals.css` to the v3 tokens in DESIGN.md §1: define all `:root` (light) + `[data-theme="dark"]`
variables EXACTLY as listed (--bg, --surface, --surface-sunken, --surface-hover, --fg, --fg-muted, --fg-subtle,
--fg-on-accent, --border, --border-strong, --accent(+hover/fg/ring/wash), --income(+fg/wash), --expense(+fg/wash),
--chart-1..5, --chart-grid, --radius-sm/md/lg/full, --shadow-sm/md/lg, motion vars). Add the `@theme inline` mapping
(§1) so `bg-surface text-fg text-fg-muted border-border bg-accent` etc. resolve. Add the shared focus-visible ring
(§6), the `prefers-reduced-motion` reset (§5), `.tabular{font-variant-numeric:tabular-nums}`, and keep `body` on
`--bg`/`--fg` + Geist/Inter. Keep `[data-theme="dark"]` switching (the existing no-flash script + ThemeToggle stay).

## Step 2 — migrate token names across ALL components (mechanical)
Replace every old token reference with the v3 name:
`--color-bg→--bg` · `--color-surface→--surface` · `--color-surface-2→--surface-sunken` (hover uses `--surface-hover`)
· `--color-border→--border` (control outlines→`--border-strong`) · `--color-text-primary→--fg`
· `--color-text-secondary→--fg-muted` · `--color-text-muted→--fg-subtle` · `--color-brand→--accent`
· `--color-brand-hover→--accent-hover` · `--color-brand-light→--accent-wash` · `--color-income→--income`
· `--color-income-bg→--income-wash` · `--color-expense→--expense` · `--color-expense-bg→--expense-wash`
· budget ok/warn/over → `--income` / `--chart-3` (amber) / `--expense`. After this, NO `--color-*` remains. Charts
that need literal hex use the v3 chart values; comment that they mirror tokens.

## Step 3 — apply v3 component rules (DESIGN.md §6–§8)
Refine each to the v3 spec — the highest-impact, anti-slop changes:
- **One rationed accent:** terracotta ONLY on the primary CTA per screen, active nav/tab, focus ring, selected check.
  Remove terracotta from anywhere else. Active segmented control = raised neutral surface (NOT accent fill).
- **Icon-tile rows NEUTRAL** (muted-ink wash + muted glyph) — kill any colored/rainbow category tiles. A category
  tint only if it IS user data (single flat ~12% tint, never gradient).
- **Summary cards neutral bg, colored NUMBER** (income/expense) — no solid green/red card fills.
- **Type:** Inter weights 440/540/620 (no 700); the metric is the biggest/boldest in its card; `tabular-nums` on all money.
- **Borders over shadows:** resting cards = hairline border (drop heavy shadows). Real shadow only on FAB/sheet/dropdown.
- **Buttons/inputs/cards/KPI/segmented/chips/tables/charts/empty-loading-error** per DESIGN.md §7 (sizes, radius, states).
- Keep BottomNav (mobile) + TopNav; active tab in accent only. Keep light+dark + uz/ru/en.
- Honor the §9 AVOID checklist throughout (no gradients/glow, no pure #000/#fff, no off-grid spacing, etc.).

(Building the full "More/Settings" page + Loans/Accounts pattern happens in later tasks 008/009 — but make the
existing pages, nav, and shared components fully v3 so those build on a clean base.)

## Gates (all green): `npm run typecheck` + `npm test` + `npm run build` (redirect long output to a temp log; read it; fix failures).
## Finish: commit `feat(ui): apply DESIGN v3 — rationed accent, warm neutral ramp, anti-AI-slop`. Report files changed,
gate results, and the screens (light + dark + mobile) to visually verify, plus anything deferred to 008/009.
