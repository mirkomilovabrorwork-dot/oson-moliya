# TASK 008 — Debts module (Qarzlar), Kissa-style

**Goal:** add a simple Debts module — track money the business lent (given) or borrowed (taken), like Kissa's
"Qarzlar". Keep it simple/clean per `docs/DESIGN.md` (works in light+dark — task 007 tokens). ADDITIVE only.

## Schema (additive — new migration; do NOT alter existing tables except none)
```prisma
enum DebtDirection { given taken }   // given = we lent; taken = we borrowed
enum DebtStatus { open settled }
model Debt {
  id           String @id @default(cuid())
  userId       String
  user         User   @relation(fields:[userId], references:[id], onDelete: Cascade)
  counterparty String                 // person/company name
  amountUzs    BigInt
  direction    DebtDirection
  status       DebtStatus @default(open)
  note         String?
  occurredAt   DateTime               // when the debt was made
  settledAt    DateTime?
  createdAt    DateTime @default(now())
  @@index([userId, status])
}
```
Add the `debts Debt[]` relation to `User`. Run `prisma migrate dev --name debts`.

## Service `src/lib/services/debts.ts`
`createDebt`, `listDebts(userId,{direction?,status?})`, `settleDebt(id)`, `updateDebt`, `deleteDebt` (owner-checked),
`getDebtTotals(userId)` → open given total + open taken total.

## API (auth + owner-scoped + BigInt-serialized, mirror existing route pattern)
- `GET /api/debts` (?direction&status) + `POST /api/debts` (body {counterparty, amountUzs, direction, note?, occurredAt?})
- `PATCH /api/debts/[id]` (edit / mark settled: {status:"settled"}) + `DELETE /api/debts/[id]`
Add DTO `DebtDTO` to `src/lib/types.ts` ONLY IF needed (or define locally) — prefer NOT editing types.ts; define a local interface.

## UI — `src/app/(dashboard)/debts/page.tsx` (+ client)
- Add "Qarzlar" to `TopNav` nav links (between Transactions and Categories or after).
- Two total cards: "Berilgan qarz" (given, income-green) + "Olingan qarz" (taken, expense-red) — Kissa layout.
- Tabs: Barchasi / Men berdim (given) / Men qarzman (taken).
- List rows: counterparty, amount (tabular), date, status; actions: mark settled, edit, delete. Settled rows muted/struck.
- Add form (modal or inline): counterparty, amount, direction, optional note + date. 44px inputs, primary button.
- Empty state ("Qarzlar yo'q — ...") + loading/error per DESIGN.md.
- Fully trilingual (add `debt.*` keys to all three dictionaries).

## Bot (optional, keep light)
Optionally extend the brain: detect "X ga N qarz berdim" (given) / "X dan N qarz oldim" (taken) → a `log_debt`
path that creates a Debt. If it complicates the tool/zod contract, SKIP bot integration for v1 (dashboard-only is fine)
and note it as deferred — do not destabilize the existing brain.

## Constraints / gates
PowerShell PATH prefix. Additive DB only. No new deps. typecheck + test + build green. Add `tests/debts.test.ts`
(totals + settle logic). Commit `feat(debts): qarzlar module (dashboard) + schema + API`.
