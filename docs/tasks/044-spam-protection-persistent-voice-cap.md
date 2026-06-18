# Task 044 — Spam protection v2: persistent daily cap for costly ops (voice/photo/audio)

## Goal
The bot ALREADY has an in-memory sliding-window limiter (20 AI msgs / 10 min/user) and
size caps. Two real gaps remain:
1. In-memory state resets on Vercel cold start → a user can spam 20, trigger a new
   instance, spam 20 more. Money-spending paths (STT, vision) need a cap that survives.
2. No SEPARATE, TIGHTER cap for the COSTLY paths (voice/audio/photo each call a paid API).

Fix: add a **persistent per-user DAILY cap for costly operations only** (voice + audio +
photo), stored on the User row, reset each Tashkent day. Keep the existing in-memory burst
limiter unchanged (it's the cheap first line of defense for text bursts).

## Verified background (file:line)
- In-memory limiter: `src/lib/telegram/bot.ts:36-54` (`RATE_LIMIT_MAX=20`, `isRateLimited`).
- Voice handler: `src/lib/telegram/bot.ts:1540-1611`. Flow: size cap (1546) → `isRateLimited`
  (1554) → `prisma.user.upsert` (1567, gives `voiceUser` + `voiceLang`) → STT download (1588).
- Photo handler: `src/lib/telegram/bot.ts:~2184-2278` (rate check ~2189, upsert ~2212).
- Audio handler: `src/lib/telegram/bot.ts:~2281-2355` (rate check ~2298, upsert ~2310).
- User model: `prisma/schema.prisma:40-58` (telegramId BigInt unique; NO rate fields today).
- Bot labels: `src/lib/telegram/reply.ts:25-160` (`getBotLabels(lang)` returns a typed object;
  add a new label here for all 3 langs ru/en/uz, following the existing `rateLimitMsg` pattern).
- Tashkent date string helper: there is an existing one (e.g. `getTashkentDateString` in
  `src/lib/claude/brain.ts`, or `getTashkentNow` in `src/lib/dates.ts`). **Find and REUSE it** —
  do NOT invent a new date formatter. The cap key must be a Tashkent (UTC+5) "YYYY-MM-DD" string.

## Files to TOUCH
- `prisma/schema.prisma` — add TWO additive nullable/defaulted fields to `User` (see below).
- `src/lib/telegram/costlyCap.ts` — NEW pure helper (the decision logic, no I/O) + the cap constant.
- `src/lib/telegram/bot.ts` — wire the cap into the voice, audio, and photo handlers
  (after the upsert that yields the user row, BEFORE the expensive download/STT/vision call).
- `src/lib/telegram/reply.ts` — add `costlyLimitMsg` to the `getBotLabels` return type + all 3 langs.
- `tests/costly-cap.test.ts` — NEW unit tests for the pure helper.

## Files NOT to touch
- The in-memory `isRateLimited` logic (keep as-is).
- The text/callback handlers (text is cheap → only the in-memory limiter applies, unchanged).
- Any other DB model, the brain, debts, web app.

## Schema change (ADDITIVE ONLY — never drop/rename)
Add to `model User`:
```
costlyOpsYmd   String?  // Tashkent "YYYY-MM-DD" of the current costly-ops day (null until first costly op)
costlyOpsCount Int      @default(0)  // costly ops used so far on costlyOpsYmd
```
Apply with `prisma db push` against the dev DB only if needed for typecheck; do NOT run any
prod command, do NOT touch git. (Opus will push to prod separately.)

## The pure helper — `src/lib/telegram/costlyCap.ts`
```ts
// Daily cap for COSTLY bot operations (voice/audio/photo — each calls a paid API).
// Generous for a real SMB user (~20-40 voice logs/day), tight enough to cap a runaway bill.
export const COSTLY_DAILY_CAP = 80;

export interface CostlyState {
  ymd: string | null;
  count: number;
}

/**
 * Decide whether one more costly op is allowed today, and return the next state to persist.
 * Resets automatically when `today` differs from the stored day.
 */
export function evalCostlyCap(
  current: CostlyState,
  today: string,
  cap: number = COSTLY_DAILY_CAP
): { allowed: boolean; next: CostlyState } {
  const base = current.ymd === today ? current.count : 0; // reset on new day or null
  if (base >= cap) {
    return { allowed: false, next: { ymd: today, count: base } };
  }
  return { allowed: true, next: { ymd: today, count: base + 1 } };
}
```

## Wiring (each of voice/audio/photo handlers)
After the handler's `prisma.user.upsert(...)` (which gives the user row + language), and BEFORE
the expensive download/STT/vision work:
```ts
const today = /* existing Tashkent date-string helper */;
const verdict = evalCostlyCap(
  { ymd: <user>.costlyOpsYmd, count: <user>.costlyOpsCount },
  today
);
if (!verdict.allowed) {
  await ctx.reply(getBotLabels(<lang>).costlyLimitMsg);
  return;
}
await prisma.user.update({
  where: { id: <user>.id },
  data: { costlyOpsYmd: verdict.next.ymd, costlyOpsCount: verdict.next.count },
});
// ...proceed with download/STT/vision as before
```
Note: the photo handler may need the upsert result; if it currently upserts without capturing
the row, capture it (the upsert already runs — just keep its return value).

## New i18n label `costlyLimitMsg` (add to all 3 langs in reply.ts)
- uz: `🎤 Bugungi ovoz/rasm limiti tugadi. Ertaga yana mumkin — yoki hozir yozma xabar yuboring (matn cheksiz).`
- ru: `🎤 Дневной лимит голосовых/фото исчерпан. Завтра снова — или напишите текстом (текст без лимита).`
- en: `🎤 Daily voice/photo limit reached. Try again tomorrow — or type your message (text is unlimited).`

## Required tests — `tests/costly-cap.test.ts`
- same day, under cap → allowed, count increments by 1.
- same day, at cap (count === COSTLY_DAILY_CAP) → NOT allowed, count unchanged.
- new day (today !== stored ymd) → allowed, count resets to 1, ymd = today.
- null ymd (first ever costly op) → allowed, count = 1, ymd = today.
- custom small cap (e.g. cap=2) boundary: count 0→1→2 allowed, 3rd blocked.

## Acceptance criteria
- Voice, audio, AND photo handlers reject with `costlyLimitMsg` once a user exceeds
  `COSTLY_DAILY_CAP` costly ops in one Tashkent day; the counter persists in the DB.
- Text messages are NOT affected by the daily cap (only the unchanged in-memory limiter).
- The reset is automatic at the Tashkent day boundary (no cron needed).
- New unit tests pass; existing tests still pass.
- The cap rejection happens BEFORE any paid API call (no STT/vision spent on a blocked msg).

## Gate commands (run via PowerShell with Node on PATH)
- `npm run typecheck`
- `npm test`
- `npm run build`

## Report back
Files changed + gate results + any deviation from this spec.
