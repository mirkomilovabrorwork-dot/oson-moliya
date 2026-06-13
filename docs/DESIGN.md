# PulTrack — Design system (UI/UX bar)

The grader explicitly judges whether this feels like a real, trustworthy tool — not a prototype.
Every screen must look intentional and consistent. Agents building UI MUST follow this. The reviewer
(Opus) runs the app and screenshots each page against this doc.

## Principle
Calm, professional fintech aesthetic. Clarity over decoration. Money is serious — the UI should feel
precise and trustworthy, never toy-like. Mobile-first (the dashboard is opened from Telegram, often on a phone).

## Color (define as CSS variables / Tailwind theme tokens; no random hex scattered in components)
- **Brand / primary:** deep indigo `#4F46E5` (indigo-600) for primary actions, active nav, links.
- **Income / positive:** emerald `#059669` (emerald-600).
- **Expense / negative:** rose `#E11D48` (rose-600).
- **Net:** neutral ink; green if positive, rose if negative.
- **Surfaces:** background `#F8FAFC` (slate-50); cards white `#FFFFFF`; borders `#E2E8F0` (slate-200).
- **Text:** primary `#0F172A` (slate-900); secondary `#475569` (slate-600); muted `#94A3B8` (slate-400).
- Budget progress: green <70%, amber 70–99%, red ≥100%.
- Support a clean look in all three languages; never hardcode width that breaks RU (longer words).

## Typography
- Font: Inter (or the Next/font default geist is acceptable) — one family.
- Scale: page title 24–28px/600; section title 16–18px/600; body 14px/400; caption 12px/500 muted.
- **Amounts use tabular figures** (`font-variant-numeric: tabular-nums`) and are formatted with thin/space
  grouping: `500 000 so'm`. Large KPI numbers 28–32px/700.

## Components & layout
- Cards: white, `rounded-xl`, `border border-slate-200`, subtle shadow (`shadow-sm`), padding `p-5/p-6`.
- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32. Consistent gaps; generous whitespace.
- Stat cards (Overview): label (caption, muted) + big tabular number + small delta vs last month
  (▲ green / ▼ rose). Icon optional, subtle.
- Top nav: brand mark + tabs (Overview / Transactions / Analytics / Categories), active tab in brand color;
  right side: LangSwitcher (UZ·RU·EN segmented) + logout. Sticky. Collapses cleanly on mobile.
- Tables: zebra-free, row hover, comfortable row height (≥44px touch), right-aligned tabular amounts,
  type shown as a colored pill (income=emerald, expense=rose). Inline edit/delete icons appear on hover (and always visible on mobile).
- Forms (quick-add, budgets): clear labels, large 44px inputs, primary button in brand color, disabled/loading states.
- Charts (Recharts): use the palette above (income emerald, expense rose), light grid, tooltips with
  formatted amounts, responsive container, empty-state message when no data.

## Required states (no blank/janky screens)
- **Empty:** friendly illustration/emoji + one-line explanation + a clear next action (e.g. "Hali yozuv yo'q —
  Telegram'da botga birinchi xarajatni yuboring"). Applies to Overview, Transactions, Analytics, Categories.
- **Loading:** skeletons or a subtle spinner — never layout jump.
- **Error:** human message + retry, never a raw stack trace.

## Interactions / polish
- Hover/active states on all clickable elements; focus-visible rings (a11y).
- Subtle transitions (150–200ms) on hover, tab switch, row expand. No flashy animation.
- Touch targets ≥44px. Buttons have clear primary/secondary hierarchy (one primary per view).
- Toasts/inline confirmation for save/delete success.

## Onboarding (first-run)
Warm, guided empty state: what PulTrack is in one line, 2–3 example bot messages the user can copy,
a "Open the bot" deep link, and a hint that data appears here automatically. Must not look like a 404.

## Do NOT
- Ship default unstyled Tailwind / raw HTML look.
- Mix ad-hoc colors — use the tokens.
- Leave English-only strings in the UI (all three languages).
- Let RU/long labels overflow or wrap badly.
