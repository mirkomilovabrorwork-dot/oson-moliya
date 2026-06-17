# Task 034 — Recurring transactions (SPEC ONLY — user direction needed)

**Status:** DRAFT SPEC · 2026-06-18 · Opus (autopilot wrote draft; not implemented overnight)
**Owner agent:** TBD after user picks direction

## 1. Goal

Real SMB use: rent every 1st (`Ijara 2M`), salary every 25th (`Ish haqi 15M`), monthly internet bill,
quarterly tax. Today these are entered manually each month — 10+ minutes wasted per month, and missed
entries break the monthly P&L.

## 2. Why not implemented overnight

This needs DESIGN DECISIONS the user must make first. Autopilot wrote no code for this task.

## 3. Decisions the user must make (on wake)

### D1. Generation model
- **A — Vercel Cron at midnight** runs a job that creates today's due `Transactions` from each
  active `RecurringRule`. Pros: dashboard is always current. Cons: needs Vercel Cron (free tier
  allows it; once-daily fine), adds an entry point that runs serverlessly with no user request.
- **B — On-page-load check.** When user opens the dashboard or bot, the server checks for missed
  due-dates and creates the transactions. Pros: no cron, lazy. Cons: app might be silent for
  weeks, then suddenly create 5 entries — confusing UX.
- **C — Bot suggests** at the schedule date. "Bu oy ijara to'lovi vaqti — saqlaymanmi?" → user
  confirms → bot creates. Pros: human-in-the-loop, no surprises. Cons: needs notifications.

Recommended: **A** + a small bot suggestion the morning of (combination). Simplest UX.

### D2. Schedule format
- Weekly (every N days)?
- Monthly (day-of-month, e.g. 1st, 25th)?
- Yearly (quarterly tax — 4 dates a year)?
- Custom cron-like?

Recommended: monthly + yearly only. Cover 95% of SMB needs. Don't ship weekly until asked.

### D3. Edit/delete behavior
- If user edits a recurring rule mid-stream, do PAST generated transactions change too?
  Recommended: NO — past entries stay frozen; future ones use the new rule.
- If user deletes the rule, do past transactions disappear?
  Recommended: NO — only stops future generation.

### D4. Categorization
- Recurring rules carry a category (so generated tx auto-categorize).
- What if the category is deleted? Recommended: rule pauses + bot/web shows "needs category".

### D5. Currency
- Recurring rule in one currency only? Or one rule auto-handles multi-currency?
  Recommended: ONE currency per rule. Multiple rules if user needs multi-currency rent.

## 4. Proposed schema (additive — pending decisions)

```prisma
enum RecurringFrequency {
  monthly
  yearly
}

model RecurringRule {
  id              String              @id @default(cuid())
  userId          String
  user            User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  type            TxType
  categoryId      String?
  category        Category?           @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  amountUzs       BigInt
  originalCurrency String?
  originalAmount   BigInt?
  note             String?
  frequency       RecurringFrequency
  dayOfMonth      Int                 // 1..28 (avoid 29-31 edge cases)
  monthOfYear     Int?                // for yearly (1..12), null for monthly
  startDate       DateTime
  endDate         DateTime?
  pausedAt        DateTime?
  lastGeneratedAt DateTime?
  deletedAt       DateTime?
  createdAt       DateTime            @default(now())

  generatedTransactions Transaction[] @relation("RecurringRuleTransactions")
  @@index([userId, deletedAt])
}
```

Add to `Transaction`:
```prisma
  recurringRuleId String?
  recurringRule   RecurringRule? @relation("RecurringRuleTransactions", fields: [recurringRuleId], references: [id], onDelete: SetNull)
```

## 5. Estimated effort

After decisions: ~5-6 hours of focused implementation:
- Schema + migration (additive)
- Service: `listActiveRules`, `createRule`, `updateRule`, `pauseRule`, `deleteRule`,
  `generateDueTransactions(userId, untilDate)`
- API routes: full CRUD on `/api/recurring`
- UI: a new "Recurring" page or section under More
- Vercel Cron (if D1.A): a small `/api/cron/recurring` endpoint with secret-header check
- Bot integration (optional first pass): a `/recurring` command + confirmation flow
- i18n: ~15 new keys

## 6. Suggested next step on wake

Ask the user in simple Uzbek the decisions D1-D5 (use AskUserQuestion / grill-me skill). After all
decisions → write the full implementation spec (replace this DRAFT) → delegate to Sonnet → ship.
