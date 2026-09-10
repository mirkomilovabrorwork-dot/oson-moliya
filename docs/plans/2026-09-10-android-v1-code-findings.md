# Android v1 — what the code actually says (verified 2026-09-10, main session)

Facts measured in the repo and on the live site. The design document
(`2026-09-10-android-one-step-capture.md`) and the WebView research
(`../research/2026-09-10-android-webview-capture.md`) are separate; this file is the
**code-side** truth the spec must be built on. Nothing here is a guess — each line names where it
was checked.

## 1. Voice and receipt exist, but ONLY inside Telegram

`find src/app/api -type d` — there is **no web endpoint** for either. The capture pipeline lives in
the Telegram webhook path only:

- Voice: `src/lib/telegram/bot.ts:1614-1626` — `ctx.api.getFile` → `downloadTelegramFile` →
  `getSttProvider().transcribe(buffer, "voice.ogg", { language })` → `handleMessage(...)`.
- Receipt: `src/lib/claude/receipt.ts:63` `extractReceipt(...)` — a standalone export, Claude vision,
  forced tool use, returns `{ found, amountUzs, category, note }`.

**Consequence for the app:** v1 must add two new routes — one that accepts an audio blob, one that
accepts an image — and they are the core of the web-side work.

## 2. The brain is already decoupled — the recorder is not

- `runBrain` (`src/lib/claude/brain.ts:29`) takes `{ text, user, pending, categoryNames }` and returns
  an intent. **Zero Telegram coupling.** A web route can call it directly.
- The step AFTER the brain — turning an intent into a saved transaction, a clarify question, a
  correction, a report — lives inside `handleMessage` (`src/lib/telegram/bot.ts:445`), a function in a
  **2400-line** file that is written against a Telegram `ctx.reply` interface.

**Decision (mine, taken here):** extract the intent→DB step into one shared module
(`src/lib/capture/apply-intent.ts`) that returns data, not chat messages, and have BOTH the bot and the
new web routes call it. Do NOT write a second money-writing path for the web — a duplicated writer of
money rows is exactly the twin-bug shape that has bitten this repo before. The extraction is also
cheap insurance: the bot is scheduled to be switched off, so the logic has to leave `bot.ts` anyway.

## 3. The STT layer does not know about `webm`

`src/lib/stt/gemini.ts:33-46` — `mimeFromFilename` maps `mp3 → audio/mpeg`, `m4a/mp4 → audio/mp4`,
`wav → audio/wav`, `ogg/oga → audio/ogg`, and **defaults to `audio/ogg`** (the comment says "Telegram
voice"). Android System WebView's `MediaRecorder` typically produces `audio/webm; codecs=opus`.

**Consequence:** a browser-recorded clip would be uploaded and labelled `audio/ogg` — a wrong MIME on
a webm container. Add an explicit `webm` case (and pass the real recorded MIME through from the
client) in the same change that adds the voice route. The exact container the wrapper produces is
being verified in the WebView research doc; the code must accept whatever it names.

## 4. Login today comes from the bot — this blocks "bot o'chsin"

Live check of `https://oson-moliya.vercel.app` at a 375×812 viewport: the first screen is
**"Kod bilan kirish — 6 xonali kod"**, with the helper text telling the user to open the bot and press
Start/`/login`. `src/app/api/auth/code/route.ts` consumes a magic token; `src/app/login/page.tsx` is
the page.

**Consequence — the one real trap in his "faqat app qolsin, bot o'chsin" decision:** the login code is
issued BY the bot. Kill the bot first and a fresh install has no way in. v1 therefore needs a login
path that does not depend on the bot before the bot is switched off. This is why the STATE board
orders the bot shutdown LAST, after the app works on his phone.

## 5. The site is not installable yet

Measured live in the page: `link[rel=manifest]` **absent**, no `theme-color`, no
`apple-mobile-web-app-capable`. The viewport meta is correct
(`width=device-width, initial-scale=1`) and there is **no horizontal overflow** at 375 px
(`scrollWidth === clientWidth === 375`), so the layout foundation is sound — what is missing is the
PWA envelope, not responsive CSS.

## 6. Toolchain, already proven on this machine

`D:\vibecoding\Takrorla\android\` builds a signed APK with JDK 11 (`C:\jdk11`) + Gradle 7.6.4 +
AGP 7.4.2, minSdk 21, targetSdk 34, and `WEBVIEW_PLAN.md` records that **Capacitor does not build
here** (its AGP 8 / JDK 17 requirement hits a JDK-16+ Gradle daemon bug on this machine). So the
wrapper is a plain `android.webkit.WebView` app, and every native capability (mic permission, camera
file chooser, launcher shortcuts) needs a small amount of Java.

## Build order this implies

1. `src/lib/capture/apply-intent.ts` — extract from `bot.ts`, bot switched to call it, tests stay green.
2. `POST /api/capture/voice` and `POST /api/capture/receipt` — session-authenticated, thin, calling the
   existing STT / vision / brain / apply-intent pieces. `webm` accepted.
3. Capture-first mobile home + PWA manifest and icons — verifiable in a browser, no APK needed.
4. The WebView APK + Java glue.
5. Bot shutdown, only after a login path that does not need the bot.
