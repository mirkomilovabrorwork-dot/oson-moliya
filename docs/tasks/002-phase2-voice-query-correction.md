# TASK 002 — Phase 2: Voice + finance query/report + correction/deletion + custom categories

**Prereq:** Phase 1 (task 001) merged & gates green. Read `CLAUDE.md`, `docs/STATE.md`,
`docs/PLAN_REVIEW.md`. Same hard constraints (PowerShell PATH prefix; Write/Edit only; no git/commit/
deploy/secrets; BigInt→string in API responses; Asia/Tashkent dates; webhook always-200).

**Goal:** the bot becomes fully conversational — voice in, answers questions, gives a report, fixes
mistakes, learns custom categories — and the Transactions API supports edit/delete.

## 1. Voice → text (swappable STT)
- `src/lib/stt/types.ts`: `interface SttProvider { transcribe(audio: Buffer, filename: string, opts?: {language?: string}): Promise<string> }`.
- `src/lib/stt/groq.ts`: `GroqWhisperProvider` — multipart POST to
  `https://api.groq.com/openai/v1/audio/transcriptions`, `model="whisper-large-v3"`,
  `response_format="json"`, file = the OGG buffer, OMIT `language` (autodetect uz/ru/en). Reads `GROQ_API_KEY`.
- `src/lib/stt/openai.ts`: `OpenAiTranscribe` stub implementing the same interface (model
  `gpt-4o-transcribe`), used only if `STT_PROVIDER=openai`. May be a thin, untested stub.
- `src/lib/stt/index.ts`: `export const stt = getEnv().STT_PROVIDER === "openai" ? new OpenAiTranscribe() : new GroqWhisperProvider()`.
- Telegram voice handler (`bot.ts`): on `message.voice` (or `audio`): send `ctx.replyWithChatAction("typing")`
  / a short "⏳ tinglayapman…" message; grammY `getFile`; download from
  `https://api.telegram.org/file/bot<token>/<file_path>` as a Buffer; `stt.transcribe(buf, "voice.oga")`;
  optionally echo "🎤 <transcript>"; then feed the transcript into the SAME `runBrain` path as text.
- `src/lib/telegram/download.ts`: helper to download a Telegram file to a Buffer.

## 2. Finance query + report (server-computed, never model SQL)
- Wire `intent: "finance_query"`: brain returns a validated `query` object → `analytics.runAggregation`.
- `src/lib/services/analytics.ts`: `runAggregation(userId, query)`:
  - resolve `period` → `[from,to)` in Asia/Tashkent (today, yesterday, this_week, this_month,
    last_month, this_year, custom via dateFrom/dateTo). Store/compare in UTC.
  - resolve `category` name → categoryId (closest existing; null if none → answer "no data").
  - validate `metric`/`groupBy`/`type` against the enum allowlist BEFORE querying; reject off-allowlist.
  - run parameterized `prisma.transaction.aggregate` / `groupBy` (exclude soft-deleted). Return numbers.
- Format a localized answer deterministically (number formatting with spaces, "so'm", localized labels).
- **NEW — report path:** add `metric: "report"` (or detect "hisobot/отчёт/report" → report). Returns a
  multi-line summary for the period: total income, total expense, net, and top 3 expense categories.
  Bot replies with a clean labeled block. Covers the task's "request report" intent.

## 3. Correction & deletion
- `intent: "correct_transaction"` (+ optional `patch`, `target` default "last") → find the user's most
  recent non-deleted Transaction (or `PendingAction.lastTransactionId`) → apply patch (amount/category/
  type/note) → confirm "Tuzatildi: …".
- `intent: "delete_transaction"` (`target` "last") → soft-delete (`deletedAt = now()`) → confirm "O'chirildi".
- Keep `lastTransactionId` updated on each log so "oxirgisini" targeting is reliable.

## 4. Custom categories + cross-language reuse + currency guard
- `intent: "add_category"` → create a Category (lowercased canonical, type) for the user → confirm.
- In `prompts.ts`: inject the user's EXISTING category names (both types) and instruct Claude to REUSE
  the closest existing category instead of creating near-duplicates across languages
  (logistika/логистика/logistics → one). Auto-create only when genuinely new.
- **Currency guard:** if the message mentions a non-UZS currency ("dollar", "$", "евро", "рубль"),
  do NOT guess — set `clarify_needed` and ask the user to enter the amount in so'm. (Document UZS-only.)

## 5. Transactions API (finish)
- Ensure `PATCH /api/transactions/[id]` (edit fields) and `DELETE /api/transactions/[id]` (soft delete)
  are complete, session-guarded, owner-checked (the tx must belong to the session user), BigInt-serialized.

## Acceptance criteria
1. `npm run typecheck` + `npm test` + `npm run build` green (build still works with NO live DB).
2. New tests: `tests/analytics.test.ts` (seed transactions; assert sum/breakdown/net/report and period
   boundaries incl. month edges + Asia/Tashkent); `tests/brain-schema.test.ts` may mock the model — assert
   the zod contract for finance_query/correct/delete/add_category sample inputs.
3. Voice path code present and behind the swappable interface (manual live verification needs GROQ_API_KEY).
4. Currency guard, cross-language category reuse instruction, and report path implemented.
5. No git/commit/deploy/secrets; no destructive DB ops beyond soft-delete.

## Final report
Files changed; gate results; STT/Groq notes; what needs live keys to verify; risks for the reviewer.
