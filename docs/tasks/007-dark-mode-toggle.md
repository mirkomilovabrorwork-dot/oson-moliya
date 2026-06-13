# TASK 007 — Light/Dark theme toggle (Kissa-style "Mavzu")

**Goal:** add a light/dark theme switch (default light). Tokens already exist in `globals.css` as CSS vars —
add a dark token set + a small toggle, with persistence. Keep it simple/clean. Read `docs/DESIGN.md`.

## Approach (minimal, robust)
- In `globals.css`, add a dark override scoped to `[data-theme="dark"]` (or `.dark`) redefining the SAME
  `--color-*` token names with dark values (do NOT rename tokens — components already use them):
  - `--color-bg: #15140f`-ish warm near-black (keep WARMTH, not pure #000), surface `#1f1d18`, surface-2 `#272420`,
    border `#36322b`, text-primary `#f0ede6`, text-secondary `#b7b2a8`, text-muted `#827d73`,
    brand stays terracotta `#d6754f` (slightly brighter for dark), brand-light `#3a2a22`,
    income `#5fae82`, expense `#d9685e`, income-bg `#1e2a23`, expense-bg `#2c211f`, budget colors adjusted.
  - Keep contrast accessible. Warm dark (not cold gray) to match the calm aesthetic.
- Theme resolution order: `localStorage('pultrack_theme')` → system (`prefers-color-scheme`) → light default.
- Set `data-theme` on `<html>` BEFORE paint to avoid flash: add a tiny inline script in `app/layout.tsx`
  (`<script dangerouslySetInnerHTML>`) that reads localStorage/system and sets `document.documentElement.dataset.theme`.
- `ThemeToggle` client component (sun/moon icon or a 3-state Yorug'/Qorong'i/Tizim segmented like Kissa's "Mavzu").
  Place it in `TopNav` next to `LangSwitcher`, and on `/login` + `/onboarding` (top-right). Writes localStorage + sets dataset.
- Charts (Recharts literal hex): pass theme-aware colors — read the resolved theme (a small `useTheme` hook or a
  CSS-var read) so income/expense series adapt. If too complex, keep the same income/expense hex (they read OK on both).
- i18n: add keys `theme.light`/`theme.dark`/`theme.system`/`nav.theme` (uz/ru/en).

## Constraints
PowerShell PATH prefix. No new deps. Don't touch `.env`, `prisma/schema.prisma`, `src/lib/types.ts`.
Every component already uses tokens — verify NO hardcoded light-only hex remains (audit P2-2/3 should be fixed in 006;
re-check charts + any `#fff`/`#F8FAFC` leftovers and route them through tokens or theme-aware values).

## Acceptance
typecheck + test + build green. Toggling switches the whole UI (no flash on reload, no unreadable contrast in dark).
All three languages. Commit: `feat(ui): light/dark theme toggle`.
