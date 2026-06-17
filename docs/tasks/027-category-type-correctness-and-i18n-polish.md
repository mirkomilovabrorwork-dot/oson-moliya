# Task 027 — Category type-correctness (no cross-type pollution) + small i18n polish

Owner report: the smart EDIT picker still shows wrong categories — INCOME lists "kommunal"/"oziq-ovqat"
(which are normally EXPENSE). Root cause (verified): `resolveOrCreateCategory`
(`src/lib/services/categories.ts:75`) only matches a canonical entry when the name AND type agree; when
the brain assigns an expense word to an INCOME transaction, the code blindly CREATES a new income-typed
"kommunal" category → permanent pollution. It does NOT self-correct. Fix = guard + better defaults +
one-time cleanup. Plus fix the few real i18n gaps from the PM audit (the audit's other "P0"s were verified
FALSE POSITIVES — debts hydration is the SSR-safe useState/useEffect pattern; clarify→Boshqa resumes via
`runBrain(pending)` merge at bot.ts:681-707 — do NOT touch those).

## Part A — Category type-correctness

### A1. Add ONE income default — `src/lib/categories-i18n.ts`
Add to `CANONICAL_CATEGORY_DEFS` (income section):
`{ key: "maosh", type: "income", uz: "maosh", ru: "оклад", en: "wage", emoji: "💼" }`
(ru/en chosen to NOT collide with expense "oylik" = ru "зарплата"/en "salary" — keep the variant map
unambiguous; verify no other variant collisions). Final INCOME set = sotuv · xizmat · maosh · boshqa kirim.
Do NOT change the expense list. `ensureDefaultCategories` will seed "maosh" idempotently for everyone.

### A2. Guard `resolveOrCreateCategory` — `src/lib/services/categories.ts`
After computing `canonical = findCanonical(name, txTypeStr)`:
- If `!canonical`, check `const opp = findCanonical(name)` (NO type filter). If `opp && opp.type !== txTypeStr`,
  the word is canonically the OPPOSITE type → DO NOT create a mis-typed category. Route to the generic
  same-type bucket: `fbKey = type === income ? "boshqa kirim" : "boshqa chiqim"`, set
  `canonical = findCanonical(fbKey, txTypeStr)`, `normalizedName = fbKey`.
- Then find/create as today using `normalizedName` + `canonical`.
Net: an expense word (kommunal, oziq-ovqat, …) can NEVER become an income category, and vice versa — it lands
in "Boshqa kirim/chiqim". This stops ALL future pollution. Add a unit test (income + "kommunal" → resolves to
the income "boshqa kirim" id, NOT a new "kommunal").

### A3. One-time cleanup SCRIPT (write only — DO NOT run; the orchestrator runs it) — `scripts/fix-miscategorized-categories.ts`
For every `Category C` where `findCanonical(C.name)` exists AND its canonical `.type !== C.type` (mis-typed):
  1. Ensure the same-type bucket `B` ("boshqa kirim" if C is income else "boshqa chiqim") exists for `C.userId`
     (create via the canonical def if missing).
  2. `prisma.transaction.updateMany({ where:{ categoryId: C.id }, data:{ categoryId: B.id } })` (re-bucket — no
     transaction lost).
  3. Delete any `Budget` rows referencing `C.id` (a mis-typed category's budget is meaningless).
  4. `prisma.category.delete({ where:{ id: C.id } })`.
Log per-user counts and a final summary. Must be **idempotent** (a second run finds nothing). Use the shared
Prisma client / DATABASE_URL from env. Bounded: only touches categories whose name is a KNOWN canonical of the
opposite type — never custom or correctly-typed categories. Wrap each user in try/catch; never throw mid-run.

## Part B — Small i18n polish (real PM-audit gaps)
- `src/app/error.tsx` (client error boundary) + `src/app/not-found.tsx`: currently hardcoded Uzbek. Make them
  trilingual. Read the language the app already uses (find the existing lang cookie name used by the dashboard —
  grep the cookie the language switcher sets; likely `lang`/`pultrack_lang`). In `not-found.tsx` (server) use the
  async `cookies()`; in `error.tsx` (client) read `document.cookie`. Fall back to "uz". Translate the heading +
  body + button labels (uz/ru/en).
- `src/app/(dashboard)/more/MoreClient.tsx` currency-save error (~line 142): the ternary omits a "uz" branch so a
  non-uz/ru/en value falls through to Uzbek. Make it explicit (`ru` → Russian, `en` → English, else Uzbek).

## Do NOT touch
- The debts page date useState/useEffect (SSR-safe — NOT a bug). The clarify→Boshqa flow (resumes via brain+pending
  merge — NOT a bug). Claude brain/tools/prompts. `prisma/schema.prisma` (no migration — no new columns). Bot
  confirmation cards / debt edit (tasks 024/025, already shipped).

## Tests
- Add the A2 guard unit test (income + expense-word → routed to "boshqa kirim/chiqim", not a new mis-typed row).
- Keep existing tests green. Update any test that asserts the exact INCOME default count if it pins it (now 4).

## Gates (PowerShell, prefix `$env:Path = "C:\Program Files\nodejs;" + $env:Path`)
`npm run typecheck` (0) · `npm test` (all green; count drifts) · `npm run build` (ok).

## Rules for the implementing agent
Read this spec + the files first. Edit/Write UTF-8 only. Additive DB only; NO prisma migration. **WRITE the cleanup
script but DO NOT run it** (the orchestrator runs it once against the live DB after review). Do NOT run git/commit/
deploy. Do NOT touch docs/STATE.md or .env. Run the gate commands yourself; report files changed + gate results +
deviations.
