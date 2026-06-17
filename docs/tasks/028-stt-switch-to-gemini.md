# Task 028 — STT switch: ElevenLabs → Gemini 2.5 Flash

**Status:** SPEC · 2026-06-17 · Opus
**Owner agent:** Sonnet (`claude-sonnet-4-6`)
**Supersedes:** `docs/tasks/026-stt-gemini-and-brain-robustness-DEFERRED.md` (Gemini half only — brain hardening stays deferred)

## 1. Goal

Add a new STT provider — **Google Gemini 2.5 Flash** via `generateContent` audio input — into the existing
`src/lib/stt/` abstraction and make it the production default. User-decided path: direct switch (no shadow
mode). Easy rollback by flipping `STT_PROVIDER` back to `elevenlabs`.

## 2. Why

ElevenLabs Scribe (current prod) gives decent Uzbek but is the most expensive of the three providers.
Gemini 2.5 Flash is multimodal, supports OGG/Opus input directly, costs significantly less per minute,
and Google trained it on a broader multilingual corpus that should handle Uzbek at least as well.
We will judge on real voice samples after switch; if quality drops, rollback is one env var.

## 3. Verified background (file:line — already mapped)

- Interface: `src/lib/stt/types.ts:5-16` — `transcribe(audio: Buffer, filename: string, opts?: {language?: string}): Promise<string>`
- Provider switch: `src/lib/stt/index.ts:18-27` — lazy-loaded by `STT_PROVIDER` value
- Existing providers: `src/lib/stt/elevenlabs.ts`, `groq.ts`, `openai.ts` (all follow the same shape)
- Audio buffer helper: `src/lib/stt/blob.ts:9` — `audioBufferToBlob(audio, "audio/ogg")`
- Voice handler: `src/lib/telegram/bot.ts:1570-1593` (voice msg) and `:2270-2282` (audio doc) — **no changes here**;
  they already call `getSttProvider().transcribe(...)` and pass the `language` opt
- Env schema: `src/lib/env.ts:3-18` — currently declares `STT_PROVIDER`, `GROQ_API_KEY`, `ELEVENLABS_API_KEY`
- `.env.example`: lines 13-16 — list of STT vars

## 4. Files to touch

1. **`src/lib/stt/gemini.ts` (NEW)** — implement `GeminiFlashProvider` with the `SttProvider` interface.
   - Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`
   - Auth header: `X-goog-api-key: <GEMINI_API_KEY>`
   - Request body — multimodal:
     ```json
     {
       "contents": [{
         "parts": [
           { "inline_data": { "mime_type": "audio/ogg", "data": "<base64>" } },
           { "text": "<prompt>" }
         ]
       }],
       "generationConfig": { "temperature": 0, "responseMimeType": "text/plain" }
     }
     ```
   - Prompt: a short, strict instruction — language-aware. Example for `uz`:
     `"Transcribe this audio verbatim in Uzbek. Output only the transcript text — no quotes, no commentary, no language tags."`
     Same shape for `ru` / `en`; default to Uzbek when no hint.
   - MIME selection: derive from the `filename` extension (`.ogg` → `audio/ogg`, `.mp3` → `audio/mpeg`,
     `.m4a` → `audio/mp4`, `.wav` → `audio/wav`). Default `audio/ogg` (matches Telegram voice).
   - Base64 encode the buffer (`audio.toString("base64")`).
   - Response parsing: `candidates[0].content.parts[0].text`, trimmed. If empty/missing → throw a clear
     error with the response body in the message (mirrors how `elevenlabs.ts` handles errors).
   - Network errors / non-200 → throw including status + first 500 chars of body.

2. **`src/lib/stt/index.ts`** — add the `"gemini"` branch:
   ```ts
   if (provider === "gemini") {
     const { GeminiFlashProvider } = await import("./gemini");
     return new GeminiFlashProvider();
   }
   ```
   Keep alphabetical with the others; keep the lazy `await import` pattern (build-safety).

3. **`src/lib/env.ts`** — add `GEMINI_API_KEY: z.string().optional()` to the schema alongside the existing
   STT keys. Do NOT change the `STT_PROVIDER` type — it remains an open string (other providers untouched).

4. **`.env.example`** — add `GEMINI_API_KEY=` line + change the comment on `STT_PROVIDER` to list `gemini`
   among the values. Keep `elevenlabs` as the example default (production env will hold `gemini`).

5. **`README.md`** — update the 4 places that mention ElevenLabs as production STT to reflect the switch:
   - Section intro line (~58)
   - Architecture section (~108-111) — diagram label + paragraph
   - Tech stack table (~143-145)
   - Any other mention (~200) — flip to "Gemini 2.5 Flash; ElevenLabs/Groq/OpenAI swappable via `STT_PROVIDER`"

## 5. Files NOT to touch

- `src/lib/telegram/bot.ts` — the caller signature is unchanged.
- `src/lib/stt/elevenlabs.ts`, `groq.ts`, `openai.ts` — leave the other providers fully intact for rollback.
- `src/lib/stt/blob.ts` — Gemini takes base64, not Blob; do NOT extend this helper.
- Any test in `tests/` — Gemini integration is untested by design (no STT tests today; manual real-voice test).
- The brain prompt / Claude config — task-028 is ONLY the STT switch. Brain hardening is a separate later task.

## 6. Acceptance criteria

A. `npm run typecheck` → 0 errors.
B. `npm test` → 124/124 pass (no STT tests added; no existing test should break).
C. `npm run build` → green.
D. With `STT_PROVIDER=elevenlabs` (existing prod env), behaviour is byte-identical: the new `gemini.ts`
   module must not be imported, must not throw at startup, must not appear in the build output of any
   non-STT code path. Verify via reading the build manifest if convenient.
E. With `STT_PROVIDER=gemini` + a valid `GEMINI_API_KEY` set: a short Node REPL script that constructs
   `new GeminiFlashProvider()` and calls `.transcribe(buf, "voice.ogg", {language: "uz"})` against a
   tiny 1-2 second test ogg buffer returns a non-empty string. **The agent does NOT run this — Opus runs
   it from the main session after the diff lands, with the real API key.** Agent only confirms the code
   compiles and the call shape matches the curl from the user.
F. `.env.example` updated; `README.md` STT mentions updated; no other docs touched.

## 7. Required tests

None. STT layer has no existing tests; this task explicitly does NOT add Gemini integration tests
(would either need a real key in CI — bad — or a heavy mock — low value). The verification gate is the
manual real-voice test the user runs after deploy.

## 8. Gate commands (run from repo root, PowerShell)

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
npm run typecheck
npm test
npm run build
```

All three must be green. Report stdout + final status.

## 9. Final report from agent

- Files changed (paths)
- Gate results (typecheck / test counts / build)
- Anything deviated from this spec
- Anything the agent was tempted to change but did NOT (e.g. refactors)

## 10. Out of scope (do NOT do)

- Do NOT change the default `STT_PROVIDER`. Opus will flip the Vercel env var, not commit a code change.
- Do NOT touch git, do NOT commit, do NOT deploy. Opus handles that.
- Do NOT modify the bot voice handler.
- Do NOT add a Gemini brain provider (that's a separate, declined task — Claude stays the brain).
- Do NOT add a "shadow mode" or A/B routing — user explicitly chose direct switch.
- Do NOT widen the existing providers' interface or change their files.
