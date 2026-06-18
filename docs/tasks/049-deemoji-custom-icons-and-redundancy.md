# Task 049 — De-emoji: custom icon set (web) + strip bot emoji + drop redundant type word

## Why
Emojis read as "AI-made" (owner). And a +/− sign (or red/green colour) already signals income
vs expense, so ALSO printing the word "Kirim/Chiqim" is redundant. Fix both. Right-sized: the app
has 26 real categories (+ a fallback) — build a cohesive custom icon for each, NOT hundreds-for-show.

## Existing foundation (REUSE — do not invent a new style)
- `src/components/CategoryMark.tsx` already renders a custom line-SVG icon in a colour chip:
  `<svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap/Linejoin="round" 18×18>`,
  chip uses CSS vars (`--income-wash` / `--surface-sunken` / `--border`). It has 8 kinds
  (megaphone, team, food, truck, home, box, sale, up, default-down) + `pickKind(name,type)` regex.
  EXTEND this exact style — every new icon must match (same viewBox, stroke 1.8, simple, recognizable).
- Canonical categories live in `src/lib/categories-i18n.ts` (26 names + emoji). Use the NAMES as the
  source of truth for `pickKind` regex. The emoji FIELD will simply stop being rendered (leave data as-is).
- Telegram bot messages are TEXT — they CANNOT render SVG. So the bot gets emoji REMOVED (clean text),
  not custom icons.

## AGENT A — WEB custom icons + drop redundant type word (files: CategoryMark.tsx, page.tsx, transactions/TransactionsClient.tsx, accounts/AccountsClient.tsx)
1. **CategoryMark.tsx — add an icon kind for every category** (match the existing 1.8-stroke line style;
   keep each simple + instantly recognizable). Suggested kind ⇄ category (READ categories-i18n.ts for the
   full name list incl. ru/en synonyms and add them to the pickKind regex):
   - sotuv/sales→`sale`(exists) · xizmat/service→`wrench` · maosh/wage→`briefcase` · boshqa kirim→`plus`
   - oziq-ovqat→`food`(exists) · logistika→`truck`(exists) · ijara→`home`(exists) · oylik/salary→`team`(exists)
   - marketing→`megaphone`(exists) · mahsulot/goods→`box`(exists)
   - soliq/tax→`receipt` · kommunal/utilities→`bulb` · transport→`car` · taksi→`car` (or `taxi`)
   - mobil aloqa→`phone` · internet→`globe` · dori-darmon→`pill` · ta'lim→`book` (or `cap`)
   - mehmondorchilik→`handshake` · kiyim→`shirt` · sovg'a→`gift` · dam olish→`umbrella`
   - benzin/fuel→`fuel` · uy-ro'zg'or→`sofa` (or a home variant) · bank/komissiya→`bank`
   - boshqa chiqim→`minus` · DEFAULT (unknown free-text category) → a neutral `tag` icon (NOT an arrow).
   Add account-type kinds too: `cash` (banknote), `card` (credit-card), `bank` (landmark) — export a small
   helper or extend CategoryMark so AccountsClient can render them.
2. **Rewire web rows to the icon, drop the emoji + the redundant TYPE WORD:**
   - `src/app/page.tsx` (home recent-tx rows, ~line 690): replace `{tx.category?.emoji ?? (…)}` with
     `<CategoryMark name={tx.category?.name} type={tx.type} size="sm" />`.
   - `src/app/(dashboard)/transactions/TransactionsClient.tsx` (rows ~857/1004): same icon swap, AND
     REMOVE the redundant type-word label `t(\`form.type.${tx.type}\`, lang)` (~line 877) — keep the
     category name + the signed, colour-coded amount (the sign + colour already convey income/expense).
   - `src/app/(dashboard)/accounts/AccountsClient.tsx`: replace the `TYPE_ICONS` emoji map (💵💳🏦, ~line
     45-49 + the empty-state 🏦 + row icon) with the new SVG account icons.
3. Keep the colour-coded signed amount everywhere (do NOT remove +/− or the red/green). Only the
   emoji + the redundant type WORD go.

Run: `npm run typecheck` only (I will run build + a visual preview myself). Do NOT run `npm run build`.

## AGENT B — BOT de-emoji + drop redundant type word (files: src/lib/telegram/reply.ts, src/lib/telegram/bot.ts)
1. **reply.ts `formatConfirmation` (~268-315): de-emoji + de-redundant.** Drop `✅`, the `🟢/🔴` type
   emoji, `🗂`, `📅`, AND the type WORD (Kirim/Chiqim/Доход/Расход/Income/Expense). Show the direction by a
   SIGN on the amount: expense → `−<amount>`, income → `+<amount>`. New shape (uz example):
   `Saqlandi\n−50 000 so'm · oziq-ovqat · bugun` (ru "Сохранено", en "Saved"; category + date kept, no emoji).
   Keep the amount/category/date data; only remove emoji + the type word; add the +/− sign.
2. **reply.ts `getBotLabels` + messages: strip ALL emoji** (🟢🔴🗑✏️⏳🎤🖼🧾📊📈🌐❓⚠️ etc.) from button
   labels, error/limit/voice/photo/receipt messages, rate-limit, persistent-keyboard labels — keep the TEXT
   only (e.g. "🟢 Kirim"→"Kirim", "🗑 O'chirish"→"O'chirish", "📊 Hisobot"→"Hisobot"). Keep all 3 languages.
3. **bot.ts: strip emoji** from the debt card (`✅🤝💵📅`, ~305-318) and report/debt headers (`📊📋💰`,
   e.g. ~356/1069/1320/1411) and any other inline emoji in bot reply strings. For the debt card, show
   direction in words is OK (it's a debt, not a +/− tx) — but remove the emoji; keep it clean text.
   The `↗️/↙️` arrows in the multi-entry debt lines (task 048, bot.ts log_multiple) — replace with plain
   text too (e.g. "Berdim: …" / "Oldim: …") for consistency.

Run: `npm run typecheck` + `npx vitest run` (reply/confirmation may have tests). Do NOT run `npm run build`.

## Files NOT to touch
- The DB, services, the brain (tools/prompts/brain), finalizeLog logic. categories-i18n.ts emoji DATA may
  stay (just stop rendering it). No git, no STATE.md.

## Acceptance
- Web: every category + account shows a cohesive custom SVG icon (no emoji); unknown categories show the
  neutral `tag` fallback; transaction rows no longer print the redundant "Kirim/Chiqim" word (sign+colour
  remain). typecheck clean.
- Bot: confirmations + buttons + messages have NO emoji; the confirmation shows a signed amount (−/+) and
  NO type word. typecheck + tests green.

## I (Opus) will: run full build + a real preview (render categories/transactions), screenshot for the
user, fix any ugly/unclear icon myself, then gates → commit → deploy.
