# QA.md — what "working" means for PulTrack / Oson Moliya

> Read by qa-6-step, qa-harden, rusher and judge. Written 2026-09-10 during the Android v1 build,
> from the settled decisions in `docs/STATE.md` and the design plan
> `docs/plans/2026-09-10-android-one-step-capture.md`. Update it whenever a journey or never-event
> changes. Guesses are marked `[?]`.

## 1. What is this product, and WHO uses it?
A money tracker for an Uzbek small business: income, expenses, debts and reports, captured by
**voice**, by **receipt photo**, or by **typing**. Reachable as a Telegram bot, a web dashboard, and
(in progress) an installable Android app.

Roles:
- **Owner / user** — the person whose money it is. There is one account per Telegram identity; all
  data is private to that account. Today's v1 target user is the product's own owner, daily.
- **Guest / logged out** — can reach only `/login`.
- **Admin** — designed but NOT built. Would be keyed to a single Telegram id in server config.

## 2. Which 3-5 journeys must ALWAYS work? (most important first)
1. **Voice capture.** Open the app (or `/capture?mode=voice`) → it records by itself → speak an
   amount → it stops on silence → the entry is saved → an unmistakable green "Saqlandi" screen shows
   the amount, category and time, with a one-tap "Bekor qilish".
2. **Manual capture.** `/capture?mode=text` → amount → category → Saqlash → the same done screen.
   This is the fallback every other mode falls back TO, so it must never be broken.
3. **Receipt capture.** `/capture?mode=photo` → camera → the grand total and a category are read from
   the image → saved → the same done screen.
4. **Seeing today.** The capture home lists today's entries with the correct running total, in
   Tashkent time, newest first.
5. **Login.** A code issued by the bot is accepted at `/login`, the session survives an app restart,
   and `?next=` returns the user to where they were going.

## 3. What is business-critical here — money, data, trust?
- **The amount.** It is stored as whole so'm in `BigInt`. A rounding, parsing or currency slip is the
  worst possible defect — worse than a crash, because a crash is visible and a wrong number is not.
- **Not saving twice.** Every `/capture` save carries a client-generated `captureId`, which is a
  `@unique` column on `Transaction`. Before doing any expensive work (transcription / vision) the
  route looks up an existing row for that `captureId` and returns it unchanged if found; a
  concurrent retry that still races past that check is caught by the database's unique-constraint
  error (Prisma `P2002`) on write, which is also resolved by returning the existing row. A retry
  after a timeout can never create a second entry.
- **Not losing an entry the user was told was saved.** "Green screen" is a promise.
- **Account isolation.** Every query is scoped by `userId`; there is no sharing feature to soften a
  leak.

## 4. What must NEVER happen? (never-events)
- A transaction is created for a user with **no amount**, or with an amount the user did not say or
  type. No amount ⇒ no save, ever — the server returns the transcript and saves nothing.
- **User A ever sees or writes user B's rows.** Every read and write is filtered by `userId`.
- A **conversion or exchange rate is applied to a debt.** A debt given in USD and repaid in UZS stays
  two separate lines, by explicit owner decision.
- The done screen appears **before** the server has confirmed the save (it must render only from a
  200 response).
- A **currency is silently changed** — an amount spoken in dollars is stored in so'm without keeping
  `originalCurrency`/`originalAmount`.
- The Telegram bot is switched off **before** a login path exists that does not depend on it — the
  login code is issued BY the bot, so killing it first locks everyone out.
- `X-Frame-Options` is re-added — this is a Telegram Mini App and it would white-screen it.

## 5. How do users behave — well, messy, malicious?
- **Well:** speaks one clear sentence ("logistikaga besh yuz ming chiqim"), photographs one receipt,
  types one amount.
- **Messy:** pocket-launches the app and records silence or background chatter; speaks with no amount
  in the sentence; photographs a blurred or multi-total receipt; taps the primary button twice;
  loses signal mid-upload; force-closes during processing; types `-500000`, `12.50`, `0`, or spaces
  inside a number; leaves the app open for a day and comes back to a stale screen.
  Each must end in a clearly-labelled state, and none may produce a wrong or duplicated row.
- **Malicious:** posts to the capture endpoints without a session (must 401), from another origin
  (must fail the same-origin check), with a 100 MB file (must 400 before any model is called), or in
  a loop to burn model credits (must 429 after 20 requests in 10 minutes, keyed per user).

## 6. What roles and states exist, and where does the biggest risk sit?
States: logged out · logged in with no entries yet (empty) · normal · offline · rate-limited ·
microphone permission denied · session expired inside the Android app.
**Riskiest combination:** a logged-in user on a flaky mobile connection whose upload times out after
the server has already saved. That is the duplicate-entry path, and it is the reason every capture
carries a `captureId` that the server de-duplicates.

## 7. AI product — what MAY the agent do, and what must it NEVER do on its own?
- **May:** transcribe audio, read a receipt image, infer income vs expense, infer a category, and
  create ONE transaction from a clear amount.
- **Never alone:** invent or adjust an amount; save when the amount is missing or unclear; delete or
  edit an existing transaction; touch debts; message anyone; or spend money.

## 8. Known fragile spots and past production bugs (the regression memory)
- **Voice was dead in production for weeks** because the STT model was pinned to a model Google
  retired, while still LISTING it. Now a three-model chain. Any "voice is broken" report starts here.
- **A debt repayment silently failed to save** because a write endpoint returned a row shaped
  differently from the list endpoint, and `BigInt(undefined)` threw outside the try/catch.
- **`dateStringToUtc` was private to `bot.ts`** and a second caller re-derived it as
  `new Date("today")` — an Invalid Date that Prisma rejects. Now shared in
  `src/lib/capture/occurred-at.ts`.
- **Money input:** `src/lib/money-input.ts` is the ONE normalizer. Stripping non-digits turned
  `-500000` into `500000` and `12.50` into `1250`. Do not "simplify" it; `tests/money-input.test.ts`
  asserts it.
- **Deploys create the deployment but do not move the canonical alias** — verifying the deployment URL
  shows a green build the public cannot see. Always `vercel alias set`.
- `src/lib/report/excel.ts:379` breaks past 26 columns (dormant, max 6 today).
- The "📊 Hisobot" button path skips the rate-limit check that `/hisobot` applies.

## 9. Surfaces (for QA Rush)
- Voice capture -> src/app/api/capture/voice/**, src/lib/stt/**, src/lib/claude/brain.ts, src/lib/capture/**
- Receipt capture -> src/app/api/capture/receipt/**, src/lib/claude/receipt.ts
- Capture screen -> src/app/capture/**, src/components/capture/**
- Manual capture -> src/components/QuickAddForm.tsx, src/app/api/transactions/**
- Login -> src/app/login/**, src/app/api/auth/**, src/lib/auth/**
- Never-event "no wrong amount" -> src/lib/money-input.ts, src/lib/services/transactions.ts, src/lib/claude/amount.ts
- Never-event "no cross-user read" -> src/lib/services/**, src/app/api/**
- Android shell -> android/**
