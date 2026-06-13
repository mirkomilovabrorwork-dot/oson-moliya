# DESIGN v3 — Oson Moliya

A calm, professional, **human-designed** finance dashboard. Warm-minimal, light + dark, mobile-first
(bottom-tab nav). Borrows Kissa's structural skeleton; never its palette. Evolves our earlier warm-minimal
direction — terracotta survives but becomes a single **rationed** accent; the rest is a warm neutral ramp.

> **The one rule:** ~90% of every screen is plain neutral so the ~10% that carries meaning (a number, the
> primary action, a gain/loss) can speak. If a treatment (color, shadow, gradient) is on *every* element, it
> is wrong. The fix for "this looks AI-made" is almost always **subtraction**.

## 0. Principles (decision rules)
1. **One accent, rationed.** Terracotta appears ONLY on: the single primary CTA per screen, the active
   nav/tab/selected state, the focus ring, selected-row checks. Nowhere else.
2. **Color must mean something.** Only 3 hues carry meaning: terracotta = action/active, green = income/positive,
   red = expense/negative/destructive. Everything else neutral. No decorative color. No rainbow icon tiles.
3. **Warm neutrals, never pure.** Warm off-white bg, warm near-black ink. Never `#000` on `#fff`.
4. **Borders separate; shadows float.** Resting cards = 1px hairline (+ optional barely-there shadow). Real
   shadows only for sheet / dropdown / dialog.
5. **Hierarchy from weight + size + ink-color**, not decoration. Never gradient/glow text.
6. **One 4px spacing ladder, one radius family (8/12/16).** No off-grid (13px, 7px).
7. **`tabular-nums` for all money.**
8. **Token pairs** (`*` + `*-foreground`/`-wash`); components use semantic tokens, never literal hex →
   light↔dark is one swap.
9. **Motion fast & functional** (120–240ms, ease-out); never decorative/looping; honor reduced-motion.
10. **Left-aligned on a grid.** Center only standalone CTAs + empty states.

## 1. Color tokens — `src/app/globals.css` (Tailwind v4 `@theme inline`)
> Implementation note: our file is `src/app/globals.css`. Adopt these v3 token names; update components to use
> them. (Migrate from the old `--color-*` names.) Map via `@theme inline` so `bg-surface text-fg border-border` work.

### Light (`:root`)
```css
--bg:#faf9f6; --surface:#ffffff; --surface-sunken:#f2f0ea; --surface-hover:#f4f2ec;
--fg:#1c1a17; --fg-muted:#6b6760; --fg-subtle:#9b958c; --fg-on-accent:#ffffff;
--border:#ece8e1; --border-strong:#ddd8cf;
--accent:#c15f3c; --accent-hover:#ad5435; --accent-fg:#ffffff; --accent-ring:rgba(193,95,60,.35); --accent-wash:#f7ece6;
--income:#3f7d5a; --income-fg:#ffffff; --income-wash:#ebf2ee;
--expense:#b5453b; --expense-fg:#ffffff; --expense-wash:#f7eae8;
--chart-1:#c15f3c; --chart-2:#4a7c8c; --chart-3:#b08a3e; --chart-4:#6b5b8a; --chart-5:#8a8780; --chart-grid:#ece8e1;
--radius-sm:8px; --radius-md:12px; --radius-lg:16px; --radius-full:9999px;
--shadow-sm:0 1px 2px rgba(28,26,23,.05);
--shadow-md:0 4px 12px rgba(28,26,23,.08),0 1px 3px rgba(28,26,23,.05);
--shadow-lg:0 12px 32px rgba(28,26,23,.14);
```
### Dark (`[data-theme="dark"]`) — re-tuned, NOT inverted (card raised above bg; translucent warm borders; desaturated income/expense)
```css
--bg:#16140f; --surface:#211e18; --surface-sunken:#100e0a; --surface-hover:#2a261f;
--fg:#f3f0ea; --fg-muted:#a8a299; --fg-subtle:#6f6a61; --fg-on-accent:#ffffff;
--border:rgba(255,250,240,.10); --border-strong:rgba(255,250,240,.16);
--accent:#d27450; --accent-hover:#c0653f; --accent-fg:#1c1610; --accent-ring:rgba(210,116,80,.40); --accent-wash:rgba(210,116,80,.14);
--income:#5fa37d; --income-fg:#0f1712; --income-wash:rgba(95,163,125,.16);
--expense:#d2675c; --expense-fg:#1a0f0d; --expense-wash:rgba(210,103,92,.16);
--chart-1:#d27450; --chart-2:#6ba0b0; --chart-3:#cda75a; --chart-4:#9385b5; --chart-5:#a39e95; --chart-grid:rgba(255,250,240,.08);
--shadow-sm:0 1px 2px rgba(0,0,0,.35); --shadow-md:0 4px 12px rgba(0,0,0,.45),0 1px 3px rgba(0,0,0,.35); --shadow-lg:0 14px 36px rgba(0,0,0,.55);
```
**Contrast:** `--fg-muted` is the lightest text allowed (WCAG AA on bg/surface). `--fg-subtle` = non-text only
(placeholders, chevrons, disabled).

## 2. Typography
Font **Inter** (variable), fallback system. `tabular-nums` wherever numbers appear. Ship **3 weights**:
regular **440**, medium **540** (labels/buttons/row titles/nav), semibold **620** (headings, KPI numbers).
Avoid 700+. Scale (size/lh/tracking): xs 12/16 +.01 · label 12/16 +.04 UPPERCASE · sm 13/20 · base 15/22 ·
lg 18/24 −.01 · xl 22/28 −.015 · metric 30/34 −.02 · metric-lg 38/42 −.02. The number is the biggest/boldest
thing in its card; its label sits above in `label` muted. Inputs 16px on mobile (no iOS zoom), 13px desktop.

## 3. Spacing & layout
4px ladder: 4/8/12/16/24/32/48/64 — never off-grid. Page padding mobile 16px horizontal, 24px below nav.
Card padding 16–20px. Section gap 24–32px. Desktop max-width: dashboard 1100px, forms/reading 640px (centered
column, left-aligned contents). Control heights: sm 32 · default 40 · lg 44 (primary mobile CTA). Icon buttons square.

## 4. Borders vs shadows
Default separator/card = `1px solid var(--border)`. Controls = `1px var(--border-strong)`. Resting cards:
border only, or border + `--shadow-sm` (one convention per surface, never both heavy). Real shadow only for
floating (sheet `--shadow-lg`, dropdown `--shadow-md`). Dark separates via raised surface + translucent border,
not bigger shadow. Never colored shadows/glows/glassmorphism.

## 5. Motion
`--dur-fast:120ms; --dur-base:180ms; --dur-slow:240ms; --ease-out:cubic-bezier(.16,1,.30,1); --ease-in-out:cubic-bezier(.4,0,.2,1)`.
Transition specific properties only (never `all`). Page enter 180–220ms slide+fade. Sheet translateY(100%)→0.
Nothing >~400ms, nothing loops (except existing loaders). Always honor `prefers-reduced-motion`.

## 6. Focus & states (EVERY interactive element)
One shared ring, never removed, no per-component variants:
```css
:where(button,a,input,textarea,select,[role="tab"],[tabindex]):focus-visible{
  outline:none; border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-ring);
  transition:box-shadow var(--dur-fast) var(--ease-out),border-color var(--dur-fast) var(--ease-out);}
```
Hover = step the SAME token (accent→accent-hover; ghost/row→surface-hover); never a hue swap. Active = scale(.98)
or one-step-darker. Disabled = opacity .5 + pointer-events none. Invalid = expense border + expense-wash ring.

## 7. Components (key specs)
- **TopNav:** sticky h-52, surface bg, bottom hairline, no fill. Title `lg`/620; one muted icon action.
- **BottomNav (mobile primary):** h-56 + safe-area, surface bg, top hairline; 3–5 tabs (icon 22 + `xs`/540 label);
  active = accent (only colored tab), inactive = `fg-subtle`. Never >5; never duplicate the FAB.
- **FAB:** 56² squircle (`radius-lg`), accent bg, `--shadow-md`, `bottom:84px right:16px`. One per app (the create action).
- **Buttons:** `radius-sm`, 540 weight, sizes h-8/h-10/h-11. primary=accent (ONE per screen); secondary=transparent+`border-strong`;
  ghost=transparent (hover surface-hover); destructive=expense; link=accent underline. No gradient/glow/resting-shadow.
- **Inputs:** h-10, `border-strong`, transparent bg, focus ring; money inputs `tabular-nums` + muted currency adornment;
  label above (sm/540), helper/error below (xs; error=expense).
- **Card:** `gap-4 rounded-md border bg-surface p-4` (+ optional `shadow-sm`). Header(title lg/620 + desc sm/muted),
  content, footer (top hairline, holds `sm` accent "View all →"). Never nest cards.
- **KPI card:** label (12 uppercase muted) → metric (30, 620, fg, tabular) → delta badge (xs/540 rounded-full;
  +▲ income-wash/income, −▼ expense-wash/expense). Grid cols-2 mobile / lg-4. Metric dominates.
- **Summary cards (Kissa):** two cards, neutral bg; label (uppercase muted) + value (24/620 tabular) — the NUMBER
  is income/expense colored, the card bg stays neutral (no solid green/red fills).
- **Icon-tile list row (core reusable):** h-14 px-4 gap-3 → icon tile 32 `radius-sm` **neutral** (muted-ink wash 12%,
  muted glyph 18) + title (base/540) + optional subtitle (sm/muted) + trailing (value sm/muted + chevron 16 subtle).
  Group = `bg-surface rounded-md border`; dividers inset to start after the tile (ml-56px). Section label above
  (12 uppercase subtle). **Tiles are NEUTRAL by default** — a single flat tint only when the tint *is* the data.
- **Segmented control:** track `surface-sunken radius-md p-[3px]`; segment flex-1 h-8 sm/540; active = raised
  `surface` + `shadow-sm` (NOT accent-filled), thumb slides `dur-base`. Max 3–4.
- **Chip filters (multi):** `rounded-full px-3 h-8 sm/540 border`; idle transparent+`border-strong`+muted; selected
  = `accent-wash` bg + accent border + accent text. Horizontal scroll, no scrollbar.
- **Tables:** no outer box / no vertical gridlines; header `xs/540 muted` sentence-case (optional sunken bg); body
  `sm/fg`, row divider hairline, hover surface-hover; **money col right-aligned, tabular, signed = income/expense
  color**; status = badge pill. Mobile → collapses to transaction rows (icon tile · name+date · right signed amount).
- **Bottom-sheet (pick 2–5):** backdrop rgba(0,0,0,.4/.6) fade; sheet `surface rounded-t-lg --shadow-lg` + grab
  handle; title base/620 centered; option rows = 7.9 anatomy; selected row = 18px **accent check** + 620 title.
- **Charts (hide the chrome):** horizontal gridlines only (`chart-grid` 1px); axis `xs/muted`; series `chart-1..5`
  in order (income line=income, expense=expense, net=chart-2 — never green/red as arbitrary series); area fade =
  the ONE permitted gradient (carries data); tooltip plain (surface+border+`shadow-md`); legend round swatches.
- **States:** keep the frame, never reflow. Empty = centered, muted icon 48, one calm verb-first line
  ("Add your first transaction" — never "Nothing here yet!"), optional primary CTA. Loading = skeleton blocks
  (`surface-sunken`, 1.4s pulse) sized to content. Error = plain line + secondary "Try again"; no red block
  unless the action was destructive.
- **Badges:** `rounded-full px-2 py-0.5 xs/540`, income/expense/neutral washes. **Progress bar:** `h-2 rounded-full
  surface-sunken` track, accent fill (or income/expense for budget); no gradient.

## 8. Page patterns
- **Dashboard:** greeting+avatar nav → hero balance (metric-lg, tabular, signed delta badge) → two summary cards
  (in/out) → one chart card (area fade) → recent activity card (3–5 rows + "View all →") → FAB.
- **Activity/Transactions:** segmented (All/Income/Expense) → chip category filters → date-grouped rows (sticky
  date sub-headers). 
- **Stats/Analytics:** KPI grid → 1–2 chart cards → optional category breakdown table/bars. Color only on numbers/series.
- **More/Settings:** section-labelled icon-tile groups (neutral tiles): PREFERENCES (Theme/Language/Currency →
  bottom-sheets, trailing current value), ACCOUNT, ABOUT (version trailing, no chevron), Log out (own group,
  centered expense text button, 32px top).
- **Loans/Accounts (Kissa skeleton, re-skinned):** two summary cards (receivable=income / payable=expense, neutral
  card + colored number) → segmented (All/…) → rows (icon tile · counterparty + due subtitle · right signed balance
  + chevron) → row tap = full detail page. Borrow layout only, not Kissa's vocabulary/palette.

## 9. AVOID — AI-slop checklist (strip until "would someone believe an AI made this?" = NO)
1. No multi-color icon-tile rainbow (the #1 tell) — tiles neutral; tint only when it IS the data.
2. One accent only — terracotta on CTA + active + focus + selected check; never 3+ elements/view; no 2nd brand color.
3. No gradients/glows as decoration (only permitted gradient = chart area-fill); no glassmorphism, no neon.
4. No gradient/glowing text. 5. No pure `#000`/`#fff`. 6. No heavy/stacked resting shadows.
7. No off-grid spacing / random control heights. 8. One radius family (8/12/16).
9. No solid green/red summary-card fills — neutral card, colored number. 10. Money right-aligned, tabular, fixed decimals.
11. No hue swap on hover. 12. No removed/per-component focus — one shared 3px ring. 13. No everything-centered/
everything-in-a-card; left-align on a grid; don't nest cards. 14. No hardcoded hex in components — tokens only.
15. No marketing microcopy / emoji-in-labels / exclamation empty states — verb-first, calm. 16. No decorative/
looping motion, no `transition:all`, nothing >~400ms. 17. No generic indigo/purple LLM palette. 18. Three Inter
weights (440/540/620), one typeface.
