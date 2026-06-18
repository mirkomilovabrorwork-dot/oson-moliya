# Task 040 — Anthropic prompt caching on the bot brain (cost prep for scale)

**Status:** SPEC · 2026-06-18 · Opus
**Owner agent:** Sonnet (`claude-sonnet-4-6`)

## 1. Goal

Add Anthropic prompt caching to the bot brain so the large static system prompt + tool schema are
cached, cutting input-token cost on repeat calls. **Honest framing:** at today's volume the saving is
~$0; this is prep for scale (hundreds of daily users) — so the PRIME directive is **do not change the
model's behavior at all**. Pure mechanical change: reorder the prompt so the static part is a cacheable
prefix, then mark it with `cache_control`. Same words, same output.

## 2. Verified background (file:line)

- `src/lib/claude/brain.ts:48-55` — the `client.messages.create({ model, max_tokens:1024, system:
  systemPrompt, tools:[RECORD_INTENT_TOOL], tool_choice:{...}, messages:[...] })` call. `system` is
  currently a plain STRING.
- `src/lib/claude/prompts.ts:6-` — `buildSystemPrompt(todayTashkent, categories, replyLang)`. The
  DYNAMIC bits (`${todayTashkent}` at line 20, `${catList}` at line 22) sit IN THE MIDDLE of otherwise
  static instructions (line 18 intro, lines 24-167 the long static rules). This middle placement
  defeats prefix caching — the cacheable static text must become a contiguous PREFIX.
- `src/lib/claude/tools.ts` — `RECORD_INTENT_TOOL` (fully static — a perfect cache candidate).

## 3. The change (behavior-preserving)

### A. Reorder `buildSystemPrompt` so static leads, dynamic trails
Restructure the returned prompt into two clearly separated regions, SAME CONTENT:
1. **STATIC PREFIX** — the intro line + ALL the rule sections (multi-currency, reply language,
   everything from line 24-167). This text never varies between calls/users.
2. **DYNAMIC SUFFIX** — appended AFTER the static block: today's date + the user's category list.
   Wrap them in a small clearly-labeled trailer, e.g.:
   ```
   ## Session context
   Today's date (Asia/Tashkent, UTC+5): {todayTashkent}
   {catList}
   ```
The MODEL must read the same information — only the ORDER changes (date/categories move from the
middle to the end). Keep every instruction sentence verbatim. Do not drop or reword guidance.

### B. Split the prompt for caching
Change `buildSystemPrompt` to return BOTH parts so brain.ts can cache the static one. Cleanest:
return an object `{ staticPrefix: string, dynamicSuffix: string }` (rename to `buildSystemPrompt`
still, or add a sibling). Update its one caller (`brain.ts:36`).

### C. brain.ts — system as array with cache_control
Change the `system` field from a string to the Anthropic structured form, marking the static prefix
as cacheable:
```ts
system: [
  { type: "text", text: staticPrefix, cache_control: { type: "ephemeral" } },
  { type: "text", text: dynamicSuffix },
],
```
Also mark the tool as cacheable (it's fully static) — add `cache_control: { type: "ephemeral" }` to
the LAST tool in the `tools` array (per Anthropic's caching rules, the breakpoint covers everything
before it). If the SDK types make tool-level cache_control awkward, the system-prefix cache alone is
the main win — system caching is REQUIRED, tool caching is nice-to-have.

### D. Verify the SDK supports it
Confirm the installed `@anthropic-ai/sdk` version accepts `system` as a content-block array with
`cache_control` (it has since mid-2024). If typecheck complains, adjust the typing — do NOT remove the
cache_control to make it compile; fix the types.

## 4. Acceptance criteria

A. `npm run typecheck` + `npm test` (124/124) + `npm run build` green.
B. `buildSystemPrompt` output, when the static + dynamic parts are concatenated, contains the SAME
   instructions + the same date + the same category list as before (no content lost — just reordered).
C. `brain.ts` sends `system` as a 2-block array with `cache_control: {type:"ephemeral"}` on the static
   prefix.
D. No behavioral logic change: the tool, tool_choice, max_tokens, model, and user-message handling are
   untouched.

## 5. Required tests

If there's an existing prompt/brain test, keep it green (it may assert substrings of the prompt — if
it asserts ordering it may need a trivial update, but DON'T weaken what it checks). Do NOT add a
live-API test (would spend money every run — see the project rule about paid tests in CI).

## 6. Gate commands
```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
npm run typecheck
npm test
npm run build
```

## 7. Final report shape
```
## Files changed / Gate results / Deviations / Tempted-but-skipped
```

## 8. Out of scope
- DO NOT change the model, max_tokens, tool schema, or ANY instruction wording — reorder only.
- DO NOT touch git/deploy — Opus verifies with one real brain call, then deploys.
- DO NOT touch the dashboard, Home, or i18n (that's the parallel task 039 — different files).
- DO NOT add a paid live-API test.
