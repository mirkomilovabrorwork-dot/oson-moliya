# Task 033 — Debt partial payments (history + remaining)

**Status:** SPEC · 2026-06-18 · Opus (autopilot)
**Owner agent:** Sonnet (`claude-sonnet-4-6`)

## 1. Goal

Today a `Debt` is a single number — fully open or fully settled. Real SMB use needs partial payments:
"I lent Sarvar 500k; he paid back 200k last week; 300k still due." Add a `DebtPayment` table, show
the remaining amount on every debt row, and let the user record a payment from the Debts page.

Bot side intentionally OUT of scope this task — adding payment via bot needs a new pending-action
intent and is complex enough to deserve its own task. Web-only path now; bot later.

## 2. Why

Audit finding #3 (`docs/STATE.md`). The current model loses payment history — once a debt is marked
settled, you can't see when each piece was paid. Without partial-payment tracking, "qoldi" on each
debt is unknowable, and `getDebtTotals` overstates open debts when partial payments have happened.

## 3. Verified background (file:line)

- `prisma/schema.prisma:Debt` — `id`, `userId`, `counterparty`, `amountUzs`, `direction`, `status`,
  `note`, `occurredAt`, `settledAt`, `deletedAt`, `createdAt`. No payments relation yet.
- `src/lib/services/debts.ts:getDebtTotals` lines 99-119 — sums `amountUzs` over open debts, grouped
  by direction. Needs updating to SUBTRACT paid amounts.
- `src/lib/services/debts.ts:listDebts` — returns the rows used by the Debts page.
- `src/app/(dashboard)/debts/DebtsClient.tsx` — renders the debt list. The row layout is around the
  600-700 line range; locate it via Grep for "isGiven" or "debt.occurredAt".
- `src/app/api/debts/` — existing CRUD routes for debts. Add a new sub-route for payments.

## 4. Schema migration

Add to `prisma/schema.prisma`:

```prisma
model DebtPayment {
  id         String    @id @default(cuid())
  debtId     String
  debt       Debt      @relation(fields: [debtId], references: [id], onDelete: Cascade)
  amountUzs  BigInt
  occurredAt DateTime
  note       String?
  deletedAt  DateTime?
  createdAt  DateTime  @default(now())

  @@index([debtId])
  @@index([debtId, deletedAt])
}
```

Add to the `Debt` model:

```prisma
  payments     DebtPayment[]
```

**Opus will run `prisma db push` against prod** AFTER Sonnet's code lands and gates are green. The
agent does NOT run `prisma db push` or any migration command.

## 5. Files to touch

1. **`prisma/schema.prisma`** — add `DebtPayment` model + `payments DebtPayment[]` relation on `Debt`.

2. **`src/lib/services/debts.ts`** —
   - **Update `getDebtTotals`** to subtract paid amounts:
     - Today it sums `amountUzs` by direction.
     - New: for each open debt, compute `remaining = amountUzs − sum(payments where deletedAt:null)`,
       then sum remainings by direction. Use a single Prisma query that joins `Debt` with its
       `payments` (use `include` or `groupBy` on payments separately and merge in code, whichever
       is cleaner — both are fine).
   - **Add `getDebtWithPayments(debtId, userId)`** returning the debt + ordered payments list
     (`occurredAt` DESC), with `remaining` computed.
   - **Add `addDebtPayment({ debtId, userId, amountUzs, occurredAt, note? })`** — validates
     ownership, validates `amountUzs > 0`, creates the payment row. If after this payment the total
     paid >= original `amountUzs`, atomically also set the debt's `status = settled` and
     `settledAt = now()`. Return the new payment + the updated debt totals.
   - **Add `deleteDebtPayment(paymentId, userId)`** — soft-delete (set `deletedAt`). If the debt was
     `settled` and is no longer fully paid after this delete, flip status back to `open` +
     `settledAt = null`.

3. **`src/app/api/debts/[id]/payments/route.ts`** (NEW) —
   - `POST` — body `{ amountUzs: string, occurredAt: string (ISO), note?: string }`; auth via
     existing `getSessionUser`; on success → 200 with `{ payment, debt }`. amountUzs sent as a
     string and parsed to BigInt — same pattern as transactions.
   - Validate that `occurredAt` is a valid date string.

4. **`src/app/api/debts/[id]/payments/[paymentId]/route.ts`** (NEW) —
   - `DELETE` — soft-deletes the payment.

5. **`src/app/(dashboard)/debts/DebtsClient.tsx`** —
   - The page already fetches `debts` (server side). Extend the server-side prop shape so each debt
     includes a `paidUzs` (string) AND a small `payments` array (or just `paidUzs` for the row;
     payments-list only when an expansion panel is opened — see below).
   - **Row display:** when an OPEN debt has `paidUzs > 0`:
     ```
     Counterparty name
     Berdim · 17.06.2026 · note
     Asl: 500 000 · To'landi: 200 000 · Qoldi: 300 000
     ```
     When `paidUzs == 0`, layout stays as today (just the amount on the right).
   - **"+ To'lov" button:** on each open debt row, a small button that opens a modal/sheet with:
     amount input (uzs, autoformatted), date input (defaults to today), optional note. Submit →
     POST. Success → re-fetch the page (use `router.refresh()`). Reuse the existing modal patterns
     in this file (the edit modal is a good template).
   - **(Optional) Expand row to show payments list** — if the row has paid > 0, add a small chevron
     that toggles a list of payments with delete buttons. If this adds significant complexity,
     SKIP it in this task — paidUzs + remaining is the minimum that closes the audit finding.

6. **`src/app/(dashboard)/debts/page.tsx`** — server component that loads debts; extend to also
   compute `paidUzs` per debt (sum of non-deleted payments). One extra Prisma call (use `groupBy`
   on `debtPayment` then merge).

7. **`src/lib/i18n/dictionaries.ts`** — add keys to all 3 langs:
   - `debt.original` — uz `"Asl"`, ru `"Изначально"`, en `"Original"`
   - `debt.paid` — uz `"To'landi"`, ru `"Оплачено"`, en `"Paid"`
   - `debt.remaining` — uz `"Qoldi"`, ru `"Остаток"`, en `"Remaining"`
   - `debt.add_payment` — uz `"+ To'lov"`, ru `"+ Платёж"`, en `"+ Payment"`
   - `debt.payment.modal_title` — uz `"To'lov qo'shish"`, ru `"Добавить платёж"`, en `"Add payment"`
   - `debt.payment.amount_label` — uz `"Summa"`, ru `"Сумма"`, en `"Amount"`
   - `debt.payment.date_label` — uz `"Sana"`, ru `"Дата"`, en `"Date"`
   - `debt.payment.exceeds` — uz `"Qoldiq summasidan oshmasin"`, ru `"Не больше остатка"`, en `"Cannot exceed the remaining"`
   - `debt.payment.saved` — uz `"To'lov saqlandi"`, ru `"Платёж сохранён"`, en `"Payment saved"`

## 6. Acceptance criteria

A. `npm run typecheck` → 0 errors.
B. `npm test` → 124/124 (no new tests added; spec is UX-only).
C. `npm run build` → green.
D. Adding a payment via the new POST route correctly:
   - Inserts a `DebtPayment` row with the given amount + date.
   - Updates `getDebtTotals` so that open totals reflect `original − paid`.
   - When cumulative payments equal/exceed `amountUzs`, the debt flips to `status: settled` + a
     `settledAt`.
E. Frontend row layout shows the 3-line "Asl/To'landi/Qoldi" when `paidUzs > 0`, normal layout when 0.
F. Deleting a payment (soft-delete) restores the open status + clears `settledAt` if applicable.
G. Form validation: cannot save a payment > remaining (server-side AND client-side).
H. Schema additions are PURELY ADDITIVE — no existing column renamed or dropped.

## 7. Required tests

No new tests added. Behavior is verified manually post-deploy. The existing test suite must continue
to pass (124/124).

## 8. Gate commands (PowerShell)

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
npx prisma generate           # regenerate client for the new model
npm run typecheck
npm test
npm run build
```

Run `prisma generate` FIRST after the schema change — otherwise typecheck cascades.

## 9. Final report shape

```
## Files changed
- ...

## Gate results
- prisma generate: <ok>
- typecheck: <pass>
- test: <N / 124>
- build: <pass>

## Deviations from spec
- ...

## Tempted-but-skipped (refactor hygiene)
- ...
```

## 10. Out of scope (DO NOT do)

- DO NOT run `prisma db push`, `prisma migrate dev`, `prisma migrate deploy`, or ANY migration
  command — Opus runs them, against PROD, manually, after reviewing the diff.
- DO NOT touch git, commits, deploys.
- DO NOT modify any existing column on `Debt` (status, settledAt, etc.) beyond adding the `payments`
  relation. ADDITIVE ONLY.
- DO NOT add bot-side payment handling — out of scope.
- DO NOT redesign the Debts page beyond the row-layout extension + new modal.
- DO NOT change `Transaction`, `Account`, brain prompt, STT, or unrelated modules.
- DO NOT add the expansion-row payments list if it requires significant new UI scaffolding — the
  3-line row display + add-payment modal is the minimum that closes the audit finding.
