# Task 023 — Remove "Download my data" (CSV export) feature

## Goal
Remove the user-facing CSV "Download my data" export entirely. The product owner
decided the existing Excel **hisobot** report covers the need, so the separate CSV
export is redundant clutter. Remove it cleanly. Keep EVERYTHING else — especially the
bank-statement **import** (`/api/import`) and the Excel report — fully intact.

## Verified background (file:line)
- **API endpoint:** `src/app/api/export/route.ts` — the whole file IS the CSV export
  (a single `GET` handler producing a CSV of transactions + debts). Delete the file and
  remove the now-empty `src/app/api/export/` directory.
- **UI card:** `src/app/(dashboard)/more/MoreClient.tsx` ~lines 329–348 — a card/link
  with `href="/api/export"` using `t("more.export")` and `t("more.export_sub")`.
  Remove this whole card block (and any now-unused local imports/vars it leaves behind).
- **i18n:** `src/lib/i18n/dictionaries.ts` — keys `more.export` and `more.export_sub`
  in EVERY locale (uz/ru/en). Remove all of them.
- **Route protection:** `src/proxy.ts` ~line 75 — `pathname.startsWith("/api/export")`
  is one condition in a protected-paths boolean OR chain. Remove this condition and fix
  the surrounding `||` / `;` so the boolean expression stays syntactically valid and
  still protects the remaining routes.

## Files to touch
- DELETE `src/app/api/export/route.ts` (+ remove the empty `export/` dir)
- EDIT `src/app/(dashboard)/more/MoreClient.tsx` (remove export card)
- EDIT `src/lib/i18n/dictionaries.ts` (remove `more.export`, `more.export_sub` in all langs)
- EDIT `src/proxy.ts` (drop `/api/export` from the protected-path check)
- SEARCH the whole repo for any test or helper referencing `/api/export`, the export
  route, or those two i18n keys — remove/adjust so nothing dangles.

## Files NOT to touch
- `src/app/api/import/**` and the import UI — the bank-statement import STAYS.
- The Excel report / hisobot feature — STAYS.
- Any Prisma schema, migrations, or DB code. No git operations. No docs/STATE edits.
- `deletedAt` usage anywhere else (it is used by other features too).

## Acceptance criteria
- `grep -ri "/api/export"` over `src/` returns nothing.
- No `more.export` / `more.export_sub` keys remain; no UI references them.
- `MoreClient.tsx` renders without the export card; no unused imports/variables left.
- `src/proxy.ts` compiles; protected-path logic still valid for the remaining routes.
- The import feature and Excel report are untouched and still present.

## Required gates (must be green; run them, report exact results)
- `npm run typecheck` → 0 errors
- `npm test` → all pass (update or remove any export-specific test)
- `npm run build` → succeeds (`prisma generate && next build`)

## Conventions
- Edit via Edit/Write only, UTF-8. Do NOT touch git or the state docs. Do NOT run any
  DB migration. Final report = files changed + exact gate results + any deviations.
