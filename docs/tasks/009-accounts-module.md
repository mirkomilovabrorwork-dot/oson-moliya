# TASK 009 — Accounts module (Hisoblar), Kissa-style — DEEPEST, do carefully

**Goal:** support multiple accounts (cash, card, …), each with a balance, like Kissa ("HISOB QO'SHISH",
"UMUMIY BALANS"). Each transaction optionally belongs to an account. Keep it SIMPLE — no transfers, no
multi-currency (UZS only). ADDITIVE & backward-compatible (existing transactions just have no account). Light+dark.

## Schema (additive migration `accounts`)
```prisma
enum AccountType { cash card other }
model Account {
  id               String @id @default(cuid())
  userId           String
  user             User   @relation(fields:[userId], references:[id], onDelete: Cascade)
  name             String
  type             AccountType @default(cash)
  initialBalanceUzs BigInt @default(0)
  createdAt        DateTime @default(now())
  transactions     Transaction[]
  @@index([userId])
}
```
Add to `Transaction`: `accountId String?` + `account Account? @relation(fields:[accountId], references:[id], onDelete: SetNull)` + `@@index([userId, accountId])`. Add `accounts Account[]` to `User`. `prisma migrate dev --name accounts`.

## Balances
- Account balance = `initialBalanceUzs` + Σ(income txns on it) − Σ(expense txns on it).
- Total balance (Kissa "UMUMIY BALANS") = Σ account balances. Compute with groupBy (NOT N+1).
- Transactions with `accountId = null` are "unassigned" — excluded from any single account but still in income/expense totals.

## Service `src/lib/services/accounts.ts`
`createAccount`, `listAccounts(userId)` (with computed balance via a single groupBy), `updateAccount`,
`deleteAccount` (owner-checked; on delete, txns' accountId → null via SetNull), `getTotalBalance(userId)`,
`ensureDefaultAccount(userId)` (seed one "Naqd"/cash account on first use).

## API (auth + owner-scoped + BigInt-serialized)
- `GET /api/accounts` (list with balances) + `POST /api/accounts` ({name,type,initialBalanceUzs?})
- `PATCH /api/accounts/[id]` + `DELETE /api/accounts/[id]`
- Extend `GET /api/transactions` to accept `?accountId=` filter; `POST/PATCH /api/transactions` to accept `accountId`.
Define DTOs locally (avoid editing `src/lib/types.ts`).

## UI
- **Accounts page** `src/app/(dashboard)/accounts/page.tsx` (+ client): add "Hisoblar" to TopNav. List account
  cards (name, type icon, balance tabular — green if ≥0). Create/edit/delete account + set initial balance.
- **Overview**: add a "Umumiy balans" total at top (sum of account balances), Kissa-style.
- **Transactions / QuickAddForm**: an optional account selector (dropdown). Bot-logged txns default to the
  default account (`ensureDefaultAccount`). Transactions table shows the account (small muted label) + account filter.
- Trilingual `account.*` keys.

## Bot (keep simple)
Bot-logged transactions go to the user's default account (call `ensureDefaultAccount` + set accountId). OPTIONAL:
detect account by name in the message ("kartadan 100 ming chiqim" → match an account named card/karta). If it
complicates the brain, default-account-only is fine for v1 — note any deferral.

## Constraints / gates
PowerShell PATH prefix. ADDITIVE, backward-compatible (existing data unaffected). No new deps. No transfers/multi-currency.
typecheck + test + build green. `tests/accounts.test.ts` (balance math + default account). Commit `feat(accounts): hisoblar module + balances`.

## ⚠️ Reviewer note
This is the deepest change — Opus must verify: existing transactions (accountId null) still work everywhere;
overview/analytics/budgets unaffected; balance math correct (incl. initial balance + soft-deleted exclusion);
no N+1; bot still logs fine with a default account.
