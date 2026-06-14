# Task 016 — Full multi-currency (UZS / USD / EUR / RUB) with live CBU rates

## Goal & user decisions (locked)
Add real multi-currency support. User decisions:
- **Rate source:** live **CBU** (Central Bank of Uzbekistan) official rates — free JSON, no key.
- **Display model:** *"everything in the chosen currency"* — the user picks ONE display currency in
  Settings and EVERY amount on the dashboard is shown converted into it.
- **Base currency = UZS.** All money is stored in so'm (existing `amountUzs` BigInt). The bot converts a
  foreign-currency entry to so'm at the current CBU rate and stores the so'm base. Display converts base→chosen.

This is large and cross-cutting. **Preserve all existing behavior for plain so'm** — UZS stays the default
everywhere; only ADD currency on top. Do not break the working bot/scorer.

## NON-NEGOTIABLE: do NOT touch / preserve
- Aggregation logic stays in `amountUzs` (base). Totals/analytics/budgets keep summing `amountUzs` — DO NOT
  change the SQL/groupBy. Only the **display formatting** converts base→chosen currency.
- Don't break the bot for so'm input. Don't change git/STATE/.env. No new deps EXCEPT none needed (use `fetch`).
- Money rounding: store `amountUzs` as integer BigInt (round on convert). Display may show 2 decimals for USD/EUR/RUB, 0 for UZS.

---

## Data model (additive migration — schema EDIT only; the human runs `prisma migrate`)
- `prisma/schema.prisma`: add to **User**: `displayCurrency String @default("UZS")`.
  (That's the only schema change. Existing rows default to UZS. Do NOT add columns to Transaction —
  the chosen display model converts from the UZS base, so per-tx original currency is not needed for display.)
- The agent EDITS schema.prisma only. **Do NOT run any migration** — the orchestrator runs `prisma migrate dev` + regenerates the client.

## New shared modules
### `src/lib/currency.ts` (PURE — importable in both server and client; NO db/fetch)
- `export type Ccy = "UZS" | "USD" | "EUR" | "RUB";`
- `export const CURRENCIES: Ccy[] = ["UZS","USD","EUR","RUB"];`
- `export type Rates = Record<Ccy, number>;` // UZS per 1 unit; UZS:1
- `export function convertFromUzs(amountUzs: bigint | number, ccy: Ccy, rates: Rates): number` // base→ccy = amountUzs / rates[ccy]
- `export function convertToUzs(amount: number, ccy: Ccy, rates: Rates): bigint` // ccy→base = round(amount * rates[ccy])
- `export function formatMoney(amountUzs: bigint | number, ccy: Ccy, rates: Rates, opts?: {sign?: "+"|"-"|"auto"}): string`
  - UZS: space-grouped integer + " so'm" (keep current style). USD: "$" prefix, 2 decimals, grouped. EUR: "€". RUB: "₽" suffix or "RUB". Use code/symbol map.
  - Respect a `sign` option (income +, expense −/U+2212) — match current per-component sign behavior.
- `export const CCY_LABEL: Record<Ccy,string>` (e.g. UZS "so'm", USD "USD ($)", EUR "EUR (€)", RUB "RUB (₽)").

### `src/lib/rates.ts` (SERVER-only — fetch + cache)
- `export async function getRates(): Promise<Rates>`:
  - Fetch CBU: `GET https://cbu.uz/uz/arkhiv-kursov-valyut/json/` (array of `{Ccy, Rate}` where Rate = UZS per 1 unit, string).
  - Parse USD/EUR/RUB `Rate` → number; build `{UZS:1, USD, EUR, RUB}`.
  - **In-memory cache** with a timestamp; refetch only if older than ~6h. Short fetch timeout (e.g. 4s).
  - **Fallback** to hardcoded approximate rates if the fetch fails or returns junk (clearly commented as
    approximate, e.g. UZS:1, USD:12600, EUR:13700, RUB:140) so the app NEVER breaks offline.
  - Stamp time via a passed-in `Date.now()` is fine here (normal server code).

## API
### `src/app/api/currency/route.ts` (NEW) — `PUT { currency: Ccy }`
- Auth via `getSessionUser` (401 if none). Validate currency ∈ CURRENCIES (zod). Update `user.displayCurrency`. Return `{ ok: true }`.

## Bot / brain (detect currency, convert to so'm at entry)
### `src/lib/claude/tools.ts`
- Add to the `record_intent` zod schema + the tool JSON schema a field `currency: z.enum(["UZS","USD","EUR","RUB"]).nullable().optional()` (default UZS when null). `amount` now means "the number in that currency" (still integer; round decimals). Update the `amount` description accordingly.
### `src/lib/claude/prompts.ts`
- **Replace the UZS-only guard** (the "If the user mentions a non-UZS currency … ask them to enter in so'm" block, ~lines 27-31, and its references at ~56/62). New rule: **detect the currency** and set `currency`:
  Match these spoken/written variants (case-insensitive; VOICE transcription often produces phonetic Uzbek spellings, so be generous):
  - **UZS** (default — also when NO currency marker): so'm, som, sum, сум, сўм; bare "ming/mln" with no other currency.
  - **USD**: dollar, **do'llir**, **do'lr**, dol, doll, $, доллар, долл, usd, USD. *(Uzbek speakers commonly say "dollar / do'llir / do'lr".)*
  - **EUR**: euro, evro, yevro, yevra, €, евро, eur, EUR.
  - **RUB**: rubl, rubli, rubla, ruble, рубль, руб, ₽, rub, RUB.
  - Set `amount` to the numeric value in that currency (expand ming/mln shorthand). No more "enter in so'm" clarification for foreign currency.
  - The deterministic parser `amount.ts` must ALSO recognize/strip these currency tokens so shorthands still parse (e.g. "50 do'llir", "2 ming dollar", "20 yevro", "1000 rubl").
- Update confirmation phrasing guidance to show the entered amount in its currency.
### `src/lib/telegram/bot.ts` (+ `src/lib/coach`/handlers if separate)
- When logging income/expense: read `intent.currency ?? "UZS"`. Fetch rates via `getRates()`. Compute
  `amountUzs = convertToUzs(parsedAmount, ccy, rates)` and store that in `amountUzs` (base). For UZS this is identity.
- Keep the deterministic `amount.ts` parser for shorthand expansion (returns the number; currency-agnostic).
- The "Qancha so'm?" clarify text → make currency-neutral ("Qancha? Miqdorni yozing." etc.).
### `src/lib/telegram/reply.ts` — `formatConfirmation`
- Accept `currency` (the entered ccy) and show the entered amount in that currency (use `formatMoney` with a single-ccy rate, or a small inline formatter). e.g. uz: "✅ Yozildi: $50 chiqim, logistika, bugun." Keep the budget-alert formatting working (it can stay in so'm or convert — keep so'm to avoid scope creep, OR use the same ccy; pick so'm base for the alert to stay safe).

## Dashboard display (convert base→display currency EVERYWHERE amounts are shown)
The user's `displayCurrency` + `getRates()` are resolved in each **server page**, then threaded into the
client components. Replace every ad-hoc so'm formatter with `formatMoney(amountUzs, displayCurrency, rates, …)`.
Touch points (each server page fetches `rates`+`ccy` and passes to its client/children):
- `src/app/page.tsx` (Home: balance hero, mini-stats, donut center total, recent rows) — uses `formatMoney`.
- `src/components/StatCard.tsx`, `src/components/BudgetBar.tsx` — take `ccy`+`rates` props; format via `formatMoney`.
- `src/components/charts/*` (HomeExpenseDonut, CategoryPie, IncomeExpenseChart, TrendLine) — take `ccy`+`rates`; axis/tooltip/labels use `formatMoney` (or a compact variant).
- `src/app/(dashboard)/transactions/TransactionsClient.tsx` + its `page.tsx` — amounts + summary cards via `formatMoney`.
- `src/app/(dashboard)/analytics/AnalyticsClient.tsx` + `page.tsx` — totals + chart amounts.
- `src/app/(dashboard)/categories/CategoriesClient.tsx` + `page.tsx` — budget limit + spent display; the budget-limit INPUT is entered in the display currency and converted to UZS via `convertToUzs` on save (update the label from "(so'm)" to the chosen ccy). spent/limit display via `formatMoney`.
- `src/components/QuickAddForm.tsx` — the manual add amount is entered in the display currency; convert to UZS via `convertToUzs` before POSTing (or send currency + amount and convert server-side in `/api/transactions`). Update the amount label to the chosen ccy. (Keep it working for UZS.)
- Keep `.tabular` styling. Keep signs (+/−) and income/expense colors.

## Settings — make the currency row functional
- `src/app/(dashboard)/more/MoreClient.tsx`: the **Asosiy valyuta** collapsible row now lists UZS/USD/EUR/RUB
  as a segmented control (like LangSwitcher). Current = `user.displayCurrency` (pass it in as a prop from the
  server page). On select → `PUT /api/currency` then `router.refresh()`. Remove the `more.currency_only` "coming soon" text.
- `src/app/(dashboard)/more/page.tsx`: pass `user.displayCurrency` into `MoreClient`.

## i18n (add to all 3 dicts)
| key | uz | ru | en |
|---|---|---|---|
| `more.currency_sub` (update) | Hisob-kitob valyutasi | Валюта отображения | Display currency |
| `currency.rate_note` | Kurs: Markaziy bank (CBU) | Курс: ЦБ Узбекистана | Rate: CBU (Uzbekistan) |
Keep `more.currency` = "Asosiy valyuta". Remove uses of `more.currency_only` (leave the key or delete from all 3).

## Acceptance criteria
1. Bot: "50 dollar logistika chiqim" / "$50" / "20 euro" / "1000 rubl" are logged (converted to so'm at CBU rate); "500 ming" still logs as UZS. Confirmation shows the entered currency. Plain so'm flow unchanged.
2. Settings → Asosiy valyuta: choosing USD/EUR/RUB/UZS updates the display; ALL dashboard amounts re-render in the chosen currency (converted from the so'm base via CBU rate).
3. Aggregations (totals/analytics/budgets) remain correct (still computed in so'm base, only displayed converted).
4. CBU fetch failure → app still renders using fallback rates (no crash/500).
5. uz/ru/en all present; gates green.

## Gates (must be green)
PowerShell: `$env:Path="C:\Program Files\nodejs;"+$env:Path`, then capture to logs (do NOT pipe through tail):
`npm run typecheck *> tc.log` · `npm test *> test.log` · `npm run build *> build.log`. All exit 0.
(The orchestrator runs `prisma migrate dev --name add_display_currency` + `prisma generate` BEFORE building.)

## Final report
Files changed; gate results (real lines); how rates are cached + the fallback values; any deviation; confirm aggregation SQL unchanged and no git/STATE/.env touched.
