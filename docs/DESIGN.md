# Oson Moliya — Design system v2 (warm-minimal, Claude.ai / Readwise / shadcn-inspired)

The grader judges whether this feels like a calm, premium, trustworthy product. Target aesthetic:
**editorial warmth + minimal chrome** — like Claude.ai and Readwise Reader, implemented with shadcn/ui-style
neutral tokens. Calm over flashy. Borders over shadows. Generous whitespace. Mobile-first.

References studied: Claude.ai (warm cream bg, terracotta accent, no shadows, thin borders, calm rhythm),
shadcn/ui theming (paired semantic tokens, neutral palette, ~10px radius, subtle surfaces), Readwise (content-first).

## Core principles
- **Minimal chrome:** NO drop shadows (at most a 1px hairline border + maybe a barely-there `shadow-[0_1px_2px_rgba(0,0,0,0.03)]`). Calm, flat, paper-like.
- **Warmth:** warm off-white/paper background, not cold gray. Cards are clean white on the warm bg.
- **Whitespace:** generous. Bigger padding, more line-height, fewer dividers. Let it breathe.
- **Restraint:** one accent (terracotta). Color used sparingly; most of the UI is neutral ink on paper.
- **Typography first:** clear hierarchy, tabular figures for money, comfortable reading rhythm.

## Color tokens (define in globals.css as CSS variables; NO ad-hoc hex in components)
Light (only theme for v1):
- `--bg`: `#FAF9F6`            (warm paper)
- `--surface`: `#FFFFFF`        (cards)
- `--surface-2`: `#F4F3EE`      (muted fill: chips, table header, hover)
- `--border`: `#EAE7DF`         (hairline, warm)
- `--text`: `#1F1E1B`           (warm near-black)
- `--text-muted`: `#6B6760`     (secondary)
- `--text-subtle`: `#9C988D`    (captions, placeholders)
- `--accent`: `#C15F3C`         (terracotta — primary buttons, active nav, links, focus ring)
- `--accent-hover`: `#A94F30`
- `--accent-weak`: `#F3E7E0`    (accent tint: active chip bg, subtle highlight)
- `--income`: `#3F7D5A`         (muted green — income amounts, chart series, positive net)
- `--expense`: `#B5453B`        (muted clay-red — expense amounts, chart series, negative net)
- Budget bar: under 70% `--income`; 70–99% `#C8893F` (amber); ≥100% `--expense`.

## Radius & spacing
- Radius: `--radius: 10px` (cards/inputs/buttons use it; pills fully rounded). Avoid bubbly over-rounding.
- Spacing scale: 4/8/12/16/24/32/48. Cards `p-6`. Section gaps `gap-6`/`gap-8`. Page max-width ~`max-w-5xl`, centered, with airy page padding (`px-5 sm:px-8 py-8`).

## Typography
- Font: keep the bundled Geist/Inter sans (clean, modern). One family.
- Scale: page title 22–24px / 600, tight tracking; section label 13px / 600 uppercase-ish muted OR 16px/600; body 14px/400 with `leading-relaxed`; caption 12–13px muted.
- **Money:** `font-variant-numeric: tabular-nums`, grouped with spaces (`1 200 000 so'm`). KPI numbers 26–30px/600, near-black; sign color only for the +/- semantics, kept subtle.

## Components (re-skin all to these)
- **Cards:** `bg-[--surface] border border-[--border] rounded-[10px] p-6`, no shadow (or the barely-there one). Card title small + muted; content generous.
- **TopNav:** paper bg, hairline bottom border, brand "Oson Moliya" in `--text` (not loud), nav links muted → active link in `--accent` (text or a subtle `--accent-weak` pill). LangSwitcher = minimal text segmented (UZ·RU·EN), active in accent. Sticky, mobile hamburger. No shadow.
- **Buttons:** primary = `bg-[--accent] text-white rounded-[10px] h-11 px-4`, hover `--accent-hover`, no shadow; secondary = `bg-transparent border border-[--border] text-[--text]`. One primary per view. Focus-visible ring in accent.
- **Stat cards (Overview):** muted caption label + big tabular number + small delta (▲ income-green / ▼ expense-red, subtle). No icons-as-decoration; calm.
- **Tables:** header row in `--surface-2`, hairline row separators, row hover `--surface-2`, ≥44px rows, right-aligned tabular amounts, type shown as a small text label or tiny dot (income-green / expense-red) — not loud pills.
- **Inputs:** `h-11 bg-[--surface] border border-[--border] rounded-[10px] px-3`, focus ring accent, placeholder `--text-subtle`.
- **Charts (Recharts):** muted palette — income `--income`, expense `--expense`, grid `--border` very light, no heavy colors; tooltips formatted money; responsive; calm empty state.
- **Budget bars:** thin track `--surface-2`, fill per threshold colors above, label tabular.

## Required states (calm, never blank/janky)
- Empty: a small muted glyph + one warm line + a quiet text/secondary CTA (e.g. "Hali yozuv yo'q — Telegram'da botga birinchi xarajatni yuboring").
- Loading: subtle skeleton blocks in `--surface-2` (no spinners-as-chrome).
- Error: a quiet line + retry; never a raw stack trace.

## Do NOT
- No drop shadows / glassmorphism / gradients / neon. No cold pure-gray (#fff/#000 only) — keep it warm.
- No ad-hoc hex — use tokens. No loud colored pills everywhere. No cramped density — keep it airy.
- Keep all three languages (uz/ru/en); never let RU long labels overflow.
