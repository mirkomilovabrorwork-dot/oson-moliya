# QA Flows — PulTrack / Oson Moliya (Step 1)

> Read-only product-logic map. Branch `design/experiment-2026-06-14`. Evidence = code (file:line). Runtime pass/fail is decided in Step 3; here we map flows + completeness gaps.
> Auditor note: the automated bot-area auditor returned empty placeholders, so bot flows below are mapped from direct code knowledge of `src/lib/telegram/bot.ts` + `src/lib/claude/*` (cited). Two automated "Critical/Low" claims were **rejected on verification** (see Gaps).

## Table A — Platform Map

| Area | Screen / Route | Entity | Main user actions | Related | Risk |
|---|---|---|---|---|---|
| Login | `/login` | Session | Open via bot magic-link → session cookie | bot `/start` | Critical |
| Home | `/` | Transaction, Budget | All-time balance, "Bu oy" stats + donut + biggest-mover, Diqqat amber card, recent 5, budget bars | all | Critical |
| Transactions | `/transactions` | Transaction | List/filter/search/paginate, edit, delete (typed confirm) | categories | High |
| Analytics | `/analytics` | Transaction | "Pul qayerga ketdi" donut, KPI Foyda/Zarar, income/expense, 6-mo trend | — | Medium |
| Categories | `/categories` | Category, Budget | Add/edit/delete category, set/edit budget | budgets | High |
| Accounts | `/accounts` | Account | Add account (name/type/initial balance); **edit/delete?**, balance display | transactions | Medium |
| Debts (Qarzlar) | `/debts` | Debt | Add debt (given/taken), settle, list | — | High |
| Converter | `/converter` | — (CBU rates) | Pick from/to currency + amount, swap, see result | — | Low |
| More/Settings | `/more` | User | Theme, language, main currency, links | all | Medium |
| Bot | `@oson_moliya_bot` | Transaction, Debt, Category | Log (text/voice/audio/photo), query, correct, delete, /hisobot, /help, /language | dashboard | Critical |

## Table B — Entity Lifecycle Matrix

| Entity | Create | Read/List | Edit | Delete/Archive | Manage/Configure | Missing logic | Priority |
|---|---|---|---|---|---|---|---|
| Transaction | ✅ bot (text/voice/photo) + web QuickAddForm | ✅ list, filter, recent, analytics | ✅ web edit modal; bot correct_transaction | ✅ soft-delete (`deletedAt`), bot delete_transaction | ✅ filters/search | ⚠️ `accountId` never set by any add flow (always null) | High |
| Category | ✅ web + bot add_category | ✅ list, picker | ✅ web edit | ✅ web delete (`onDelete:SetNull` → txs become uncategorized) | ✅ 25 defaults + i18n | ⚠️ delete leaves txs uncategorized (graceful, but no reassign) | Medium |
| Budget | ✅ web (Categories) | ✅ Home bars + Diqqat | ✅ web edit | ⚠️ delete budget? (set 0?) | ✅ alert (bot) + amber bars | ⚠️ no explicit "remove budget"; state-sync lag after tx edit | Medium |
| Account | ✅ web add | ✅ list | ⚠️ **edit?** (confirm) | ⚠️ **delete?** (confirm) | ❌ balance is static `initialBalanceUzs`, NOT derived from txs | **half-built** | Medium |
| Debt | ✅ bot + web | ✅ list (open/settled) | ⚠️ edit (web only?) | ✅ settle (status→settled) | ✅ given/taken | ⚠️ no hard-delete; settle is one-way | Medium |
| User/Session | ✅ bot magic-link | ✅ getSessionUser | ✅ language/currency | ❌ logout? token revoke? | ✅ | Low — logout not exposed | Low |

## Table C — Flow Inventory (execution list for Step 3)

| # | Flow | Trigger | Expected | Edge cases | Gap | Critical? | Smoke? |
|---|---|---|---|---|---|---|---|
| 1 | App launches / Home renders | open `/` (authed) | Hero + stats + donut render, no crash | getRates down (→ fallback, no crash ✅verified) | none | Y | Y |
| 2 | Magic-link login | bot `/start` → tap link | session set → `/` | expired/used token (atomic consume) | none | Y | Y |
| 3 | Log expense (text) | bot "500 ming logistika" | tx created, confirm reply | garbled STT, missing amount→clarify | none | Y | Y |
| 4 | Log via voice | bot voice msg | transcribe → same as text | weak Uzbek STT (best-effort) | H | Y | Y |
| 5 | Log via audio file | bot audio | transcribe → log; "hisobot"→Excel (fixed) | — | none | N | N |
| 6 | Log via receipt photo | bot photo | vision → expense draft | blurry/non-receipt | H | N | N |
| 7 | Finance query | bot "bu oy logistika qancha?" | correct total (Tashkent window) | report keyword must NOT hijack | none | Y | Y |
| 8 | Report on demand / `/hisobot` | command or "hisobot" text/voice/audio | Excel document | localized headers | none | N | Y |
| 9 | Correct last tx | bot "oxirgisini to'g'rila" | updates last tx | target≠last (only last handled) | A | N | N |
| 10 | Delete last tx | bot "o'chir" | soft-delete | — | none | N | N |
| 11 | Proactive budget alert | expense pushes category over limit | bot warns once/month | one-alert guard (`lastAlertedYm`); no 80% warn | none | N | N |
| 12 | Web add transaction | FAB → QuickAddForm | tx in list + Home updates | double-submit (no idempotency), 0 amount, foreign currency | H,H | Y | Y |
| 13 | Web edit transaction | edit modal → PATCH | row updates, totals refresh | edit modal lacks loading state | H | Y | N |
| 14 | Web delete transaction | typed-confirm → DELETE | row removed (soft) | — | none | Y | Y |
| 15 | Set/edit budget | Categories → set limit | bar + Diqqat reflect | **state-sync lag** after tx change | D | Y | Y |
| 16 | Manage categories | add/edit/delete | list updates; lang-translated | delete → txs uncategorized | B | Y | Y |
| 17 | Add account | Accounts → add | account in list | **balance static; accountId never linked** | B | N | Y |
| 18 | Add/settle debt | Debts → add/settle | list + status update | settle one-way; edit? | A | Y | Y |
| 19 | Currency converter | Converter screen | live CBU result, swap | invalid/empty amount → 0 | none | N | Y |
| 20 | Multi-currency display | log foreign → view | native + main-currency equiv | no double-conversion (verified earlier) | none | Y | Y |
| 21 | Statistics donut + insight | Home/Analytics | round donut + % + "biggest mover" | empty (no data) state | none | Y | Y |
| 22 | Theme switch (light/dark) | More → theme | no-flash, tokens apply | — | none | N | Y |
| 23 | Language switch uz/ru/en | More → language | all strings translate | **possible hardcoded UZ in analytics** | H | Y | Y |
| 24 | Nav + Telegram back button | bottom/top nav, device back | one screen back, not exit | root hides back | none | Y | Y |
| **Resilience rows** | | | | | | | |
| R1 | Empty states | new user, no data | calm icon + verb-first copy | — | verify each screen | Y | Y |
| R2 | Error / timeout state | API 500/timeout | friendly error, retry | — | H? | Y | N |
| R3 | Offline / no network | drop network | (Telegram needs network) | no service worker — by design | H(by-design) | N | N |
| R4 | Permission / IDOR | another user's id | every query owner-scoped (verify) | — | F | Y | N |
| R5 | Long text / special chars | long note / emoji | stored + capped (1000 words server) | — | none | N | N |
| R6 | Back mid add/edit | press back in form | **form state lost** | — | H | N | N |
| R7 | Refresh page | reload with filters | **filter/URL state lost** | — | none(UX) | N | N |
| R8 | Kill & relaunch | reopen Mini App | data persists (DB-backed) | session cookie persists | none | Y | Y |
| R9 | Cancel mid-flow | close AddSheet | no partial write | — | none | N | N |

## Gaps — consolidated (post-verification)

**Rejected on verification (NOT bugs — auditor over-claimed):**
- ❌ "Home crashes if getRates fails" — `rates.ts:47-88` never throws (try/catch → FALLBACK_RATES). No crash.
- ❌ "Category delete orphans transactions" — `schema.prisma:75` `onDelete: SetNull` → txs become uncategorized gracefully; budget cascades. Not an orphan/crash.

**Confirmed gaps:**
| ID | Severity | Type | Gap | Evidence |
|---|---|---|---|---|
| G1 | Medium | B | **Accounts half-built:** `accountId` column exists but no add flow (web/bot) assigns it; account balance shown = static `initialBalanceUzs`, never derived from transactions; no account filter on transactions. Feature looks functional but does nothing. | `schema.prisma:76`, `AccountsClient.tsx:39` |
| G2 | Medium | D | **Budget state-sync lag:** budget bars / Diqqat may not refresh immediately after a transaction add/edit (relies on `router.refresh()`). | Home + BudgetBar |
| G3 | Medium | H | **No idempotency on web tx create:** rapid double-submit of QuickAddForm may create duplicate transactions. | `POST /api/transactions` |
| G4 | Medium | H | **Possible hardcoded Uzbek in Analytics** — verify in Step 3 (language switch). | analytics area (auditor claim) |
| G5 | Low | A | Account edit/delete + Debt edit + "remove budget" + logout/token-revoke not clearly exposed — confirm. | Accounts/Debts/Settings |
| G6 | Low | H | Web form state lost on back mid-flow; transaction filters not persisted on refresh (URL state). | TransactionsClient |
| G7 | Low | perf | Transactions fetch capped at 500 rows; large-list client memory. | TransactionsClient |
| G8 | Low | by-design | No offline/service-worker (acceptable: Telegram Mini App requires network). | — |

## Coverage note
- 24 functional flows + 9 resilience rows mapped. Critical = 14. Smoke = 16.
- Bot AI flows (3,4,6,7,9,10,11) + authed dashboard screens will be **runtime-Unverified** in Step 3 (no dev-auth bypass; live bot = real API cost). Build-health + code-audit + live-endpoint used instead. Gaps G1–G8 are code-evident now.
