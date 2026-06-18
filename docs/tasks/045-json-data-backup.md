# Task 045 — JSON data backup ("Download all my data")

## Goal
Give the user a one-tap "download all my data as a JSON file" button in /more. This is a
data-safety / data-ownership feature (export only — there is no JSON re-import, and the copy
must NOT promise restore). Today the only exports are the Telegram-only monthly Excel report
and (removed) CSV. A full JSON dump lets the user keep their own faithful copy.

## Verified background (file:line)
- Auth + serialization pattern (COPY THIS EXACTLY) — `src/app/api/debts/route.ts:1-50`:
  - `import { getSessionUser } from "@/lib/auth/session";` → `const user = await getSessionUser();`
    → if `!user` return `Response.json({ error: "Unauthorized" }, { status: 401 })`.
  - `import { serializeBigInt } from "@/lib/serialize";` → wrap every response body that contains BigInt.
  - `export const dynamic = "force-dynamic";`
- Prisma client: `import { prisma } from "@/lib/db";` (confirm the exact export name/path used by other services, e.g. `src/lib/services/debts.ts`).
- Money is BigInt whole so'm — MUST be serialized to string via `serializeBigInt` before `Response.json`.
- /more page: `src/app/(dashboard)/more/page.tsx` (server) + `src/app/(dashboard)/more/MoreClient.tsx`.
  A "Trash / Savatcha" link was added in task 038 — FIND it and mirror its placement + styling for
  the new backup entry (both are data-management entries). Match the existing card/link markup exactly.
- i18n: `src/lib/i18n/dictionaries.ts` (uz/ru/en flat maps) + the `t(key, lang)` helper used across the app.
  Find how /more strings are looked up and add new keys the same way.

## Files to TOUCH
- `src/app/api/backup/route.ts` — NEW. `GET` handler, session-guarded, returns the JSON dump as a
  downloadable attachment.
- `src/app/(dashboard)/more/MoreClient.tsx` (and/or `more/page.tsx`, wherever the Trash link lives) —
  add a "Download my data (JSON)" entry next to the Trash link, as a download link to `/api/backup`.
- `src/lib/i18n/dictionaries.ts` — add the new keys in all 3 languages.

## Files NOT to touch
- The bot, debts service logic, schema (NO DB change — this is read-only export), any other route.

## The backup route — `src/app/api/backup/route.ts`
```ts
import { getSessionUser } from "@/lib/auth/session";
import { serializeBigInt } from "@/lib/serialize";
import { prisma } from "@/lib/db"; // confirm exact import

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch ACTIVE (non-deleted) records the user owns. Scope EVERY query by userId.
  const [transactions, categories, accounts, budgets, debts, recurringRules] = await Promise.all([
    prisma.transaction.findMany({ where: { userId: user.id, deletedAt: null }, orderBy: { occurredAt: "desc" } }),
    prisma.category.findMany({ where: { userId: user.id } }),
    prisma.account.findMany({ where: { userId: user.id } }),
    prisma.budget.findMany({ where: { userId: user.id } }),
    prisma.debt.findMany({ where: { userId: user.id, deletedAt: null }, include: { payments: { where: { deletedAt: null } } } }),
    prisma.recurringRule.findMany({ where: { userId: user.id } }),
  ]);

  const payload = serializeBigInt({
    app: "PulTrack",
    exportedAt: new Date().toISOString(),
    profile: {
      id: user.id,
      telegramId: user.telegramId,
      firstName: user.firstName ?? null,
      username: user.username ?? null,
      language: user.language,
      displayCurrency: user.displayCurrency,
      createdAt: user.createdAt,
    },
    transactions,
    categories,
    accounts,
    budgets,
    debts,
    recurringRules,
  });

  const filename = `pultrack-backup-${new Date().toISOString().slice(0, 10)}.json`;
  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
```
NOTES:
- VERIFY the actual model + field names against `prisma/schema.prisma` before relying on them
  (e.g. soft-delete is `deletedAt` on Transaction/Debt/DebtPayment; Category/Account/Budget may
  NOT have `deletedAt` — only include the `deletedAt: null` filter on models that actually have it,
  else Prisma will throw). Adjust each `where` to the real schema.
- `user` from `getSessionUser()` — confirm it exposes telegramId/firstName/username/language/
  displayCurrency/createdAt. If `getSessionUser` returns a trimmed shape, fetch the full user via
  `prisma.user.findUnique({ where: { id: user.id } })` for the profile block.

## The /more entry
- Mirror the existing Trash link's markup/styling. It must be a download link:
  `<a href="/api/backup" download> … {t("more.backup", lang)} … </a>` with a sub-label
  `{t("more.backup_sub", lang)}`. Pick a distinct icon (e.g. 💾 or ⬇️) — do not reuse Trash's icon.
- Place it adjacent to the Trash entry (same section).

## New i18n keys (all 3 langs)
- `more.backup`:
  - uz: `Ma'lumotlarni yuklab olish`
  - ru: `Скачать мои данные`
  - en: `Download my data`
- `more.backup_sub`:
  - uz: `Barcha yozuvlaringiz bitta JSON faylда (zaxira nusxa).`
  - ru: `Все ваши записи в одном JSON-файле (резервная копия).`
  - en: `All your records in one JSON file (a backup copy).`
  (Fix the uz line's stray cyrillic "да" → "fayl da" should read "JSON faylda".)

## Acceptance criteria
- `GET /api/backup` while logged in → 200, a JSON attachment whose body contains the user's
  transactions/categories/accounts/budgets/debts(+payments)/recurringRules + profile, with ALL
  BigInt values as strings (no `BigInt` serialization crash).
- `GET /api/backup` while logged out → 401.
- Every query is scoped by `userId` (no cross-user leak).
- The /more page shows a new "Download my data" card next to Trash; clicking it downloads the file.
- Copy does NOT promise restore (export only).
- typecheck + test + build all green; no new test required (verify via preview), but nothing breaks.

## Gate commands (PowerShell, Node on PATH)
- `$env:Path = "C:\Program Files\nodejs;" + $env:Path`
- `npm run typecheck`
- `npm test`
- `npm run build`

## Report back
Files changed (one line each) + exact prisma import used + which models actually had `deletedAt`
(so the where-filters are correct) + gate results + any deviation.
