# Task 020 — Smart category: auto-categorize like a secretary, confirm-with-buttons when unsure

## Goal (user: "ideal bo'lsin")
Make the bot categorize like a real secretary, and when it is NOT confident, ask the user with **tappable
category buttons** ("shunaqa dedizmi yo boshqami") instead of guessing wrong or asking in plain text.
Keep it CALM (#1 rule): when the bot IS confident, just log + confirm (NO buttons — buttons only when unsure).
Builds on the Commit-2 inline-button infrastructure (callbackQuery handler + finalizeLog). Additive; text flow stays.

**Sequencing:** runs AFTER the voice-language fix lands (both touch `bot.ts`). No DB migration.

## Files (ONLY these)
`src/lib/claude/prompts.ts` (categorization rules), `src/lib/telegram/bot.ts` (clarify branch + callback handler),
`src/lib/telegram/reply.ts` (category button labels helper). Possibly `src/lib/claude/tools.ts` only if a field
is missing (prefer not). No other files.

## Behavior
### A. Smarter categorization (prompts.ts)
Update the COACH/record_intent system prompt so Claude, for log_income/log_expense:
1. FIRST tries to map the item to ONE of the **user's existing categories** (passed in the prompt as
   `categoryNames`) — e.g. "lavash"/"osh"/"choy" → an existing "ovqat" category; "benzin"/"taksi" → "transport".
   Think like a bookkeeper: pick the closest sensible existing category.
2. If no existing category fits but there is an OBVIOUS common one, set that category name (the server
   auto-creates it, as today).
3. **If the category is genuinely AMBIGUOUS/uncertain** (amount + type are known but the right category is
   unclear), set `category = null`, `intent = "clarify_needed"`, `missing_fields = ["category"]`, and a
   `reply_text` like uz "Qaysi kategoriya?" / ru "Какая категория?" / en "Which category?". Do NOT silently
   guess a wrong category. (Type/amount clarification rules stay exactly as they are.)

### B. Category buttons (bot.ts `clarify_needed` branch)
When `clarify_needed` AND the missing field is **category** (draft has `amount` and a resolved `type`, but
`category` is null/missing):
- Load the user's existing categories of that `type` (income vs expense). Take up to ~6.
- Send `reply_text` WITH an inline keyboard: one button per category (label = category name, optionally its
  emoji), arranged ≤2 per row, PLUS a final **"✏️ Boshqa"** button. `callback_data`:
  `c:<categoryId>` for each, and `c:other` for Boshqa. (Keep total buttons small/calm.)
- Still store the PendingAction draft (so typing a category name also works as today).
- If the missing field is type or amount → behave exactly as now (type → [Kirim][Chiqim]; amount → text).

### C. callbackQuery handler (bot.ts) — add two cases
- **`c:<categoryId>`** → load the user's pending `clarify_needed` draft; if missing/expired → `answerCallbackQuery`
  + expired message. Else: verify the category belongs to the user (findFirst by id+userId); resolve its name;
  set it on the draft; `answerCallbackQuery`; call `finalizeLog(...)` with `{ amount, txType (from draft), category: <name>, dateStr, note }`. (Reuse the existing finalizeLog.)
- **`c:other`** → `answerCallbackQuery`; reply "Kategoriya nomini yozing (masalan: ovqat)" (localized) and LEAVE the
  pending `clarify_needed` draft in place so the user's next TEXT message resumes via the existing clarify flow
  (the brain gets the pending context + the typed category → completes the log). Do not clear pending here.
- Keep all existing callback cases (t:income/t:expense, d:/dy:/dn) UNCHANGED; always `answerCallbackQuery`;
  wrap in the existing try/catch; verify ownership on every DB access.

### D. reply.ts — category button labels
Add to `getBotLabels` (or a small helper) the localized "✏️ Boshqa" / "✏️ Другое" / "✏️ Other" label and the
"type the category" prompt + the category-expired message. Category button labels are the category names themselves.

## Acceptance criteria
1. Confident case: "logistikaga 500 ming chiqim" → logs to *logistika* with NO category buttons (calm), as today.
2. Unsure case: an ambiguous item (amount+type known, category unclear) → bot shows the user's category buttons
   + "✏️ Boshqa"; tapping a category logs it; "✏️ Boshqa" → user types the name → logs.
3. Smarter mapping: common items map to sensible existing categories (secretary-like), not a wrong/blank guess.
4. Type-clarify ([Kirim][Chiqim]) and delete ([🗑]→Ha/Yo'q) buttons still work; text flow ("tuzat"/"o'chir"/typing
   a category) still works; bot never crashes on a callback.
5. uz/ru/en complete; typecheck/test/build green.

## Constraints
UTF-8 via Edit/Write only. Touch ONLY prompts.ts, bot.ts, reply.ts (+ tools.ts only if strictly needed).
No git/migration/.env/STATE. Preserve everything from Commits 1 & 2 + the voice-language fix. Keep buttons CALM
(only when unsure; small keyboards). Final report: files changed, the category callback_data scheme, and the
exact prompt rule added for "ask when unsure".
