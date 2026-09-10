# Android WebView wrapper — what mic, camera, session and one-step launch actually require

_Researched 2026-09-10 by a dedicated research agent; captured here by the main session because the
agent's file-write tool was disabled. Grades are the agent's own: **VERIFIED** = read first-hand from
a named source, **LIKELY** = corroborated but the primary reference page could not be read as prose,
**UNVERIFIED** = no source read. Overall confidence: **medium** — the on-disk facts about our own
proven wrapper are first-hand; several `developer.android.com/reference/...` pages returned
navigation-only markdown and had to be corroborated by third parties._

Ground truth for "what already builds on this machine" is `D:\vibecoding\Takrorla\android\`
(JDK 11 + Gradle 7.6.4 + AGP 7.4.2, minSdk 21, targetSdk 34, compileSdk 34 —
`app/build.gradle:54,58,59`, VERIFIED).

## 1. Microphone

- `WebChromeClient.onPermissionRequest` + `PermissionRequest.grant(...)` with
  `RESOURCE_AUDIO_CAPTURE` is the mechanism (API 21+, secure origins only, must run on the UI thread,
  and the **app must already hold the Android `RECORD_AUDIO` permission**) — LIKELY.
- **Our proven wrapper has neither piece.** `AndroidManifest.xml:20` declares only `INTERNET`, and
  `WebViewActivity.java:52` sets a `WebViewClient` but **never calls `setWebChromeClient`** — VERIFIED.
  So microphone support is **net-new Java**, not a flag we flip.
- Version floor: Chrome's own MediaRecorder announcement says audio recording needs **Chrome 49+**
  (47–48 were video only) — VERIFIED. It never states the default `mimeType` — UNVERIFIED.
- Codec in practice: Chromium defaults to **`audio/webm` + Opus**, and Android System WebView tracks
  Chrome — LIKELY (third-party summaries only).

**Rule this forces on our code:** call `MediaRecorder.isTypeSupported()` at runtime, upload the blob's
**real** `type`, and make the server accept `audio/webm`. Do not hardcode a container.

## 2. Camera / receipt photo

- A plain WebView shows **no file picker at all** unless `WebChromeClient.onShowFileChooser` is
  overridden (start an activity for result, return the `Uri[]` through the `ValueCallback`, return
  `true`) — LIKELY.
- **`capture="environment"` does not open the camera in a WebView** — the user only gets the photo
  picker. To snap a receipt you must build a `MediaStore.ACTION_IMAGE_CAPTURE` intent yourself — LIKELY
  (a MAUI issue thread + Microsoft Q&A).
- `EXTRA_OUTPUT` needs a FileProvider authority. The Takrorla project carries one
  (`build.gradle:128`, `res/xml/filepaths.xml` exists — VERIFIED) but the `<provider>` block is
  **absent from the manifest as read** (the TWA block was stripped) — so it must be re-added — the
  absence is VERIFIED, whether it lives elsewhere is UNVERIFIED.
- `getUserMedia` video is the same plumbing as §1 plus `CAMERA`.

**Lower-risk choice: the file-chooser + `ACTION_IMAGE_CAPTURE` path.** No `CAMERA` permission is
needed when the camera app owns the capture, we get a full-resolution JPEG for the vision endpoint,
and there is no canvas encode step.

## 3. Android 13 / 14

- `POST_NOTIFICATIONS` is a runtime permission on API 33+: manifest entry **and** a runtime request;
  notifications are off by default for new installs. Targeting 33+ (we target 34) means we choose when
  the dialog appears; targeting ≤32 lets the system show it at first channel creation and a
  "Don't allow" sticks until reinstall — VERIFIED.
- `READ_MEDIA_IMAGES` / Selected Photos Access effect on the file chooser at targetSdk 34 —
  **UNVERIFIED, check before shipping any gallery path.**

## 4. One-step launch paths — feasibility only

All are plain framework; none needs Capacitor/TWA/AndroidX. **Shared cost:** the activity hardcodes
its URL (`WebViewActivity.java:25,72`, VERIFIED), so every path needs the same small edit — read
`getIntent()` and load `START_URL + "?action=record"`.

| Path | Feasible in a plain WebView | Cost / catch |
|---|---|---|
| (a) Static shortcuts (`shortcuts.xml`) | Yes, **no Java** | Max 4 shown. **Static shortcut intents cannot carry extras or data** — only `action`/`targetPackage`/`targetClass` — so pass "record" as a custom **action string** (VERIFIED). ⚠️ See the gradle trap in §7. |
| (b) Pinned home-screen shortcut | Yes, **API 26** | `requestPinShortcut()` + `isRequestPinShortcutSupported()`, ~15 lines Java, and it **can** carry a full Intent with extras (VERIFIED). |
| (c) Ongoing notification + action buttons | Yes | Channel (API 26) + `POST_NOTIFICATIONS` (API 33) + `PendingIntent` extras (VERIFIED). |
| (d) Quick Settings tile | Yes | `TileService` + `BIND_QUICK_SETTINGS_TILE` + the `QS_TILE` intent-filter; `startActivityAndCollapse` needs `FLAG_ACTIVITY_NEW_TASK` since API 28 (VERIFIED). Android 14 reportedly restricts `startActivityAndCollapse(Intent)` — UNVERIFIED. |
| (e) App Widget | Yes | Standard `AppWidgetProvider`; `PendingIntent` carries extras — UNVERIFIED, no source read. |
| (f) `ACTION_SEND` share target / `ACTION_ASSIST` | Send: yes, an intent-filter. Assist: only if chosen as the device assistant | UNVERIFIED. |

## 5. Cookies & session persistence

- `CookieManager.flush()` "ensures all cookies currently accessible through the getCookie API are
  written to persistent storage"; **unflushed cookies can die with the process**. Set
  `setAcceptCookie(true)` explicitly; third-party cookies need `setAcceptThirdPartyCookies(webView,
  true)`. A cookie with no `Expires`/`Max-Age` is a session cookie — LIKELY.
- `setDomStorageEnabled(true)` + `setDatabaseEnabled(true)` are already present and proven necessary
  (`WebViewActivity.java:41-42`) — VERIFIED.
- **Silent-logout causes to avoid:** a session-only cookie with no `flush()`; a token in `localStorage`
  with DOM storage off; any `removeSessionCookies()`/`clearCookies()` on start; and **a new
  `applicationId` = a new data directory** — the same mechanism `WEBVIEW_PLAN.md:25-33` documents for
  IndexedDB (Chrome's store and WebView's store are separate; users had to export and restore).
- Google OAuth blocks generic WebView user agents; the shipped fix strips `"; wv"` and `Version/X.Y`
  (`WebViewActivity.java:44-50`, VERIFIED) and is still listed as a live risk at `WEBVIEW_PLAN.md:233`.

## 6. PWA installability (the cheap parallel path)

VERIFIED against web.dev's install criteria: HTTPS; a manifest with `short_name` or `name`, `icons`
including **192 px and 512 px**, `start_url`, `display` ∈ {fullscreen, standalone, minimal-ui,
window-controls-overlay}; `prefer_related_applications` absent or false; an engagement heuristic
(≥1 tap, ~30 s); and not already installed. The page does **not** list a service worker with a fetch
handler among the requirements — LIKELY that it is no longer strictly required (absence of a
statement, not a statement).

## 7. Repointing the wrapper to our domain

- Start URL and host allowlist are the literal `readwiser.netlify.app`
  (`WebViewActivity.java:25,57`) — VERIFIED. Both must change.
- Changing `applicationId` makes it a **separate app with a new data dir and no upgrade path**; the
  provider authority follows it (`build.gradle:57,128`) — VERIFIED.
- **Digital Asset Links are NOT a blocker** — the only intent-filter left is MAIN/LAUNCHER, with no
  `VIEW` + `autoVerify` (`AndroidManifest.xml:34-42`) — VERIFIED.
- Dead TWA scaffolding still names the old host as `resValue` strings (`build.gradle:23-51,79,84`) —
  cosmetic, not runtime — VERIFIED.
- Signing: keystore `android/highlights.keystore`, alias `highlights`, **passwords are not in the repo —
  the owner must type them**. `bubblewrap update`/`merge` are forbidden (they wipe hand-written code);
  `bubblewrap build` is allowed — VERIFIED as documented.
- ⚠️ **Trap:** a `generateShorcutsFile` gradle task runs on every `preBuild` and **rewrites
  `res/xml/shortcuts.xml`** from an empty `twaManifest.shortcuts` list, targeting the deleted
  `LauncherActivity` (`build.gradle:167-202`, `res/xml/shortcuts.xml` is currently an empty
  `<shortcuts/>`) — VERIFIED. **Delete that task before using launch path 4(a).**
- JDK 11 + Gradle 7.6.4 + AGP 7.4.2 are unaffected by a domain switch — VERIFIED.
- 🛑 **CORRECTION (main session, 2026-09-10): the toolchain is NOT on this machine.** `WEBVIEW_PLAN.md`
  describes the laptop as it was BEFORE the 2026-06 Windows reinstall (its own text points at a
  `C:\Users\localhost\...` worktree that no longer exists). Measured here today: `java` is **not on
  PATH**, `C:\jdk11` **does not exist**, and there is **no Android SDK** at `%LOCALAPPDATA%\Android\Sdk`,
  `C:\Android\Sdk` or `~/.bubblewrap`. Disk is not the problem — 95 GB free.
  So `gradlew assembleDebug` cannot run until a JDK and the Android command-line SDK are installed
  (~1.5 GB of downloads). The wrapper SOURCE is complete and self-consistent under
  `D:\vibecoding\pultrack\android\`; only the build step is blocked.
  **The APK is therefore NOT on the critical path:** the site is already installable as a PWA, which
  on Android gives a real home-screen icon, its own window, working microphone and camera, and the
  same three launcher shortcuts from `src/app/manifest.ts`.

## VERDICT

1. Mic in a WebView is **buildable but net-new**: `RECORD_AUDIO` + runtime request + a
   `WebChromeClient` we do not currently have. Server must accept `audio/webm`.
2. Receipts: use the **file-chooser + `ACTION_IMAGE_CAPTURE`** path, not `capture=` and not
   `getUserMedia` — and re-add the FileProvider `<provider>` block.
3. One-step: **pinned home-screen shortcut (b)** is the strongest — API 26, ~15 lines, and it can
   carry extras; static shortcuts (a) are free but cannot carry extras and collide with the gradle trap.
4. Session survives restarts if DOM storage stays on, the cookie is not session-only, and
   `CookieManager.flush()` is called.
5. Asset links are irrelevant; the real repoint work is the URL/host constants, the applicationId, the
   FileProvider block, and deleting `generateShorcutsFile`.

## ✅ SETTLED AFTER THE FACT — the webm question (main session, 2026-09-10)

The design plan called this the "day-1 probe" and the research above left it open. It is now
**answered with evidence**, so nobody needs to re-open it:

- A real `audio/webm` (Opus) clip was synthesised locally (Windows SAPI → WAV → `ffmpeg -c:a libopus
  -f webm`, 16 251 bytes) and posted to **Groq Whisper** exactly as `src/lib/stt/groq.ts` does it —
  **HTTP 200, correct transcript**. Repeated with the Blob labelled `audio/ogg` (which is what
  `src/lib/stt/blob.ts` does today regardless of the filename) and with the correct `audio/webm`
  label: **both returned 200 and the same transcript**, so the existing mislabelling is harmless.
- **Gemini** documents `audio/webm` in its supported inline-audio MIME list
  (https://ai.google.dev/gemini-api/docs/audio, fetched 2026-09-10).

**Conclusion: the browser/WebView recording format is safe on both providers.** No server-side
transcode is needed, and the `webm` case added to `mimeFromFilename` is the whole fix.

Still worth one on-device check when the APK first runs: confirm the phone's WebView actually picks
`audio/webm;codecs=opus` (the client asks `MediaRecorder.isTypeSupported()` and uploads the blob's
real type, so an unexpected container would surface immediately rather than silently).

## COULD NOT VERIFY

- ~~The container/codec Android System WebView's MediaRecorder actually emits~~ — the format question
  is settled above for the SERVER side; the remaining unknown is only which container the owner's
  specific phone picks, and the client handles that dynamically.
- `READ_MEDIA_IMAGES` / Selected Photos Access effect on the file chooser at targetSdk 34, and any
  33→34 behaviour change touching WebView permissions.
- Android 14's reported restriction on `TileService.startActivityAndCollapse(Intent)`.
- minSdk figures for static shortcuts and `TileService`; `ACTION_ASSIST` requirements; App Widget
  details.
- Whether the FileProvider `<provider>` block still exists anywhere in the manifest.
- Exact signatures/API levels for `WebChromeClient`, `FileChooserParams`, `CookieManager` and
  `PermissionRequest` — four reference pages were unreadable as prose.

## What would change the answer

1. A different MediaRecorder container on the real device flips the server-side STT contract in §1.
2. If Selected Photos Access turns out to require `READ_MEDIA_IMAGES` at targetSdk 34, receipt capture
   gains a permission dialog and §2's risk ranking narrows.
