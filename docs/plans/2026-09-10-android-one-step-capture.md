# Android one-step capture - design plan (2026-09-10)

Scope: the APK is a plain Android WebView wrapper around https://oson-moliya.vercel.app.
This plan fixes two things only: (a) the fastest honest path from an idle phone to a
recorded expense, (b) what the app's first screen is. Owner's requirement, verbatim:
"2 step menga 1 step kerak". v1 user = the owner, every day.

Counting rule used everywhere below: one physical action = one tap / long-press / swipe /
fingerprint / button press. Speaking is the payload and is not counted; a tap needed to
STOP or CONFIRM is counted.

Today (Telegram): fingerprint -> tap Telegram -> find the bot (1-2) -> hold mic -> release
= 4-5 actions.

Android floor: anything that opens the app needs the phone unlocked. Fingerprint = 1 action
(0 when face unlock fires on wake). The only way around it is a lock-screen button that
starts a Java service which records and uploads with no WebView at all (row J below).

Icons in the wireframes are written as [mic] [cam] [pen] [chart]; the build uses the site's
existing SVG icon set, not emoji.

## 1. THE ONE-STEP MECHANISM

| # | Path | Plain WebView can do it? | Java needed | Actions before speaking (idle, locked) | Verdict |
|---|------|--------------------------|-------------|----------------------------------------|---------|
| A | App icon -> app opens ALREADY RECORDING | Yes: page calls getUserMedia on load, Java grants it | Mic-permission glue ~40 lines (needed for voice at all) | fingerprint 1 + tap 1 = **2** | **PRIMARY** |
| B | Launcher long-press shortcuts "Ovoz / Chek / Yoz" | Yes: `shortcuts.xml`, each shortcut carries a URL | ~15 lines: read intent URL, `onNewIntent`, `launchMode=singleTask` | 1 + long-press + tap = 3 | **FALLBACK**; also how Chek/Yoz get their own icons |
| C | Pinned home-screen shortcut (drag B to home once) | Yes, same XML | 0 extra | 1 + tap = 2 for EACH mode | Free with B; done on setup day |
| D | OEM hardware shortcut: Samsung "Side key double press -> open app"; Samsung/Xiaomi lock-screen app shortcut | Yes: it is just an app launch | 0 | double-press = **1** (fingerprint sensor is on that key) | Set up if his phone allows; the only literal one-step |
| E | Ongoing notification with 3 action buttons | Yes (Java posts it, buttons open the Activity with URLs) | ~60 lines + POST_NOTIFICATIONS prompt + boot receiver | swipe + tap + fingerprint = 3 | CUT: never fewer than A, permanent clutter in the shade |
| F | Quick Settings tile | Yes (TileService -> startActivityAndCollapse) | ~40 lines, Android 14 PendingIntent variant, tile added by hand | swipe + tap + fingerprint = 3 (2 if already unlocked) | CUT for v1: equal to A, more Java, more setup |
| G | Home-screen widget with 3 buttons | Yes (RemoteViews -> Activity) | ~80 lines + 2 XML layouts | 1 + tap = 2 | CUT: same count as C at 80 lines; v2 only if he wants "today total" on the home screen |
| H | Assistant: "Hey Google, open Oson Moliya" | Yes (OS app launch) | 0 | 0 hands, 2 speech turns, unlock still asked | Free bonus, not designed for; Assistant has no Uzbek, so App Actions are impossible |
| I | Share target (text or image from another app) | Text: yes, ~10 lines (EXTRA_TEXT -> URL param). Image: ~100 lines (content URI -> upload with cookie) | see left | not an idle-phone path; a different job (bank SMS -> expense) | Text = v1.5, image = v2 |
| J | Lock-screen action -> Java records and uploads, app never opens | No WebView involved | ~300 lines: recorder, upload with session cookie, result notification, Android 14 mic-foreground-service rules | swipe + tap = 2, no unlock | v-never: fragile, expensive, and only saves the fingerprint |

Why nothing beats A: every path that shows the web screen costs unlock + one action.
E/F/G/H re-spend the same two actions with more Java. Only D removes an action, and D is
an OEM setting, not code.

Recommendation:
- PRIMARY = A + C. The app icon (and its pinned "Ovoz" twin) opens straight into
  recording. Fingerprint, one tap, speak, phone stops by itself, saves by itself, green
  screen. That is "1 step" after unlock, which is the Android floor.
- FALLBACK = B. Long-press the icon -> Chek / Yoz (both are also secondary buttons on the
  first screen). Zero Java beyond reading the URL. Works on every launcher since Android 7.1.
- BONUS at zero cost: if the phone is a Samsung, set Side key double-press -> Oson Moliya.

Java inventory for v1 (all of it, ~150 lines + XML, one careful day):
1. `WebChromeClient.onPermissionRequest` -> grant `RESOURCE_AUDIO_CAPTURE` after the
   `RECORD_AUDIO` runtime permission is held (~40 lines).
2. `onShowFileChooser` + FileProvider + `ACTION_IMAGE_CAPTURE` when
   `isCaptureEnabled()`, else `ACTION_GET_CONTENT` (~70 lines + `file_paths.xml` + the
   provider in the manifest). Do NOT declare the CAMERA permission: launching the system
   camera by intent needs none, so photo mode never shows a permission prompt.
3. `shortcuts.xml` + manifest meta-data; the Activity reads the intent's data URL,
   `launchMode="singleTask"`, `onNewIntent` -> `loadUrl` (~15 lines).
4. `onResume`: backgrounded more than 10 minutes -> `loadUrl(".../capture?mode=voice")`,
   so the app never resumes on a stale dashboard (~10 lines).
5. Manifest `VIBRATE` (lets `navigator.vibrate` work); `setMediaPlaybackRequiresUserGesture
   (false)` (the done-ding plays without a tap); user-agent suffix `OsonMoliyaApp/1` (1 line).
6. Hardware back -> `webView.goBack()` when history exists (very likely already in the
   Takrorla wrapper).

Launch URLs: icon and "Ovoz" -> `/capture?mode=voice`; "Chek" -> `/capture?mode=photo`;
"Yoz" -> `/capture?mode=text`. The page consumes `mode` with `history.replaceState` the
moment it acts on it, so Back/Forward never re-arms the microphone.

ASSUMPTION: his phone runs Android 11+ with Google's Android System WebView (Chromium 110+), so getUserMedia and MediaRecorder (webm/opus) work inside the wrapper.
ASSUMPTION: the wrapper's Activity is ours to edit (bubblewrap-converted project with one Activity, as in Takrorla).
ASSUMPTION: the server STT chain accepts the WebView's `audio/webm;codecs=opus` blob, or the doer adds one transcode step to ogg/wav on the server; this is the day-1 probe.
ASSUMPTION: two HTTP routes can wrap the bot's existing server functions (voice -> transaction, photo -> transaction) without changing them; the bot's own path stays untouched.
ASSUMPTION: the login cookie lasts at least 90 days and the WebView keeps it across restarts; if it is shorter, set it to 1 year for the app user-agent.

## 2. THE FIRST SCREEN

Route: `/capture` (new). It is the app's launch URL and the only thing the icon opens.
The existing Overview stays at `/` untouched; nothing that links to `/` changes. `/capture`
is a light page: no Recharts, no dashboard queries, one fetch for today's rows.

Layout reference: 360 x 800 CSS px. Everything that must be tapped sits in the bottom 45%
(thumb zone). One accent colour, used only on the primary button and the live-mic dot.
Light and dark come from the site's existing CSS variables plus one new pair
`--done-wash` (light: soft green, dark: deep green).

STATE R - RECORDING. This is what he sees when he taps the icon (<= 1 s after the splash):

```
+--------------------------------+
| X                    Bugun . 3 |  top bar 56px: X cancels (48px hit); right = today count -> today list
|                                |
|                                |
|           (o) Gapiring         |  22px semibold; the dot pulses = mic is live
|      .:|||:..:|||||:..:||:.    |  live level bars 40px tall (proof the mic hears him)
|                                |
|   masalan: "logistikaga besh   |  14px muted hint; shown only for his first 20 captures
|   yuz ming chiqim"             |
|                                |
|                                |
|   +------------------------+   |
|   |     [stop]  Tayyor     |   |  PRIMARY: full width, 72px tall, accent fill
|   +------------------------+   |
|     [cam] Chek      [pen] Yoz  |  secondary: two 48px text buttons, muted
+--------------------------------+
```

Recording rules: starts by itself; ambient level measured in the first 300 ms; "speech
began" = level above 3x ambient for 200 ms; 1.5 s of silence after speech -> stops by
itself (Tayyor is for the impatient); no speech for 4 s -> state V-F1; hard cap 20 s.
Chek / Yoz while recording = cancel and switch mode.

STATE P - PROCESSING (3-6 s): same layout, bars frozen, text "Yozyapman...", thin progress
line under it; X still cancels. After 8 s the text becomes "Sekin internet...".

STATE D - DONE. Rendered ONLY from the server's 200 response, never before:

```
+--------------------------------+
|   whole screen: --done-wash    |
|                                |
|         (big check mark)       |  64px
|           Saqlandi             |  24px
|                                |
|        -500 000 so'm           |  40px bold, tabular
|     [ico] Logistika . chiqim   |  18px; TAP this line = category picker sheet
|        bugun, 14:32            |  14px muted
|                                |
|  [ Bekor qilish ] [ Tuzatish ] |  two 48px secondary buttons; Bekor in red text
|                                |
|   +------------------------+   |
|   |      [mic]  Yana       |   |  PRIMARY 72px: next capture in the same mode
|   +------------------------+   |
+--------------------------------+
```

Plus two short vibrations and a soft ding. Nothing auto-dismisses and nothing moves on its
own; he leaves with Home or Back and the record stays. "Done" is unmistakable because
three senses agree: green screen, buzz, sound.

Fixing a wrong result in ONE tap:
- Whole thing wrong (pocket recording, nonsense) -> "Bekor qilish": record deleted, toast
  "O'chirildi", screen goes to STATE H (never back into recording by surprise).
- Amount wrong -> "Tuzatish": the manual form pre-filled with this record in edit mode ->
  change -> Saqlash.
- Category wrong -> tap the category line -> picker (his top 8 + search) -> tap -> saved at
  once, card updates in place.
- Income/expense swapped -> inside Tuzatish (the toggle). v1 puts no third button on the card.

STATE H - IDLE HOME (after X, after Bekor, or `/capture` opened with no mode):

```
+--------------------------------+
| Oson Moliya            [chart] |  [chart] -> / (the existing Overview)
|                                |
| Bugun               -1 250 000 |  16px label, 20px total
| [ico] Logistika       -500 000 |  rows 52px, newest first, max 5
| [ico] Tushlik          -45 000 |  tap a row -> edit form (same as Tuzatish)
| [ico] Mijoz to'lovi +2 000 000 |
| Hammasi ->                     |  -> /capture/today
|                                |
|                                |
|   +------------------------+   |
|   |    [mic]  Gapirish     |   |  PRIMARY 72px: tap = STATE R
|   +------------------------+   |
|   [ [cam] Chek ]  [ [pen] Yoz ]|  secondary 48px
+--------------------------------+
```

First run / empty state:
1. No session -> `/login` (existing page) with one added line and a button "Telegramda
   kod olish" that opens `tg://resolve?domain=oson_moliya_bot`; he gets the code, comes
   back, types it, the cookie is set, and `/login?next=/capture?mode=voice` returns him to
   the mic. Once per phone.
2. First recording -> Android's microphone dialog. Just before it, in-page: "Mikrofon
   so'raladi - 'Ilova ishlatilganda' ni tanlang". "Only this time" would re-ask on every
   cold start and kill the one-step goal, so this one sentence is load-bearing.
3. Empty today list: "Bugun hali yozuv yo'q" plus the example hint. No tour, no carousel.

ASSUMPTION: voice is ~80% of his daily captures, photo ~15%, typing ~5%; the order and size of the buttons follow this.
ASSUMPTION: the bot saves without asking for confirmation today; the app mirrors that (Open decision 2 can override).
ASSUMPTION: the existing `/api/transactions` supports PATCH and DELETE for Tuzatish / Bekor; if not, they are two small routes.
## 3. THE THREE FLOWS

### 3.1 Voice
1. Fingerprint. Tap the icon (or pinned "Ovoz"). Splash <= 1 s.
2. STATE R. Mic live within ~300 ms of page load; dot pulses, bars move.
3. He says "logistikaga besh yuz ming chiqim" (2-5 s).
4. 1.5 s of silence -> recording stops -> STATE P "Yozyapman..." (or he taps Tayyor).
5. Page POSTs the blob to `/api/capture/voice` with a client-made `captureId`; server:
   STT -> LLM -> save -> `{id, amountUzs, type, categoryName, occurredAt, transcript}`.
6. STATE D. Buzz + ding. He puts the phone down. Done.

Failure states (what he SEES / what he TAPS):
- V-F1 No speech for 4 s -> grey card "Hech narsa eshitilmadi" / primary "[mic] Qayta",
  secondary "[pen] Yoz". Nothing saved.
- V-F2 No amount found (STT nonsense, background chatter) -> amber card
  "Tushunmadim: '<transcript>'" / primary "[mic] Qayta", secondary "[pen] Yoz" (form opens
  with the transcript in the note, so the words are not lost). Nothing saved.
  RULE: no amount = no save, ever; the server returns 422 with the transcript.
- V-F3 Amount found, category unsure -> SAVED with category "Boshqa"; STATE D shows the
  category line with an amber "?" / one tap opens the picker. Saving beats asking: the
  number is the money, the label is a click.
- V-F4 No network, server error, or 20 s timeout -> red card "Saqlanmadi - internet yo'q"
  (or "Server javob bermadi") / primary "Qayta yuborish" (re-POSTs the same blob with the
  same `captureId`, so a request that saved but timed out is not saved twice), secondary
  "[pen] Yoz", small line "Ilovadan chiqsangiz, yozuv yo'qoladi". Blob lives in memory only.
- V-F5 Mic permission denied -> card "Mikrofonga ruxsat yo'q" / primary "Ruxsat berish"
  (asks again; after two denials Android silences the dialog, so the card then shows the
  path "Sozlamalar -> Ilovalar -> Oson Moliya -> Ruxsatlar -> Mikrofon"); "[cam] Chek" and
  "[pen] Yoz" keep working.
- V-F6 Pocket launch -> V-F1 stops it after 4 s; if garbage did save, "Bekor qilish" on
  STATE D, or the row in the today list -> edit form -> delete.

### 3.2 Photo (receipt)
1. Fingerprint. Tap pinned "Chek" (or long-press -> Chek, or Chek on any capture screen).
   Opens `/capture?mode=photo`.
2. Screen = one huge button "[cam] Chekni suratga olish" (72px, thumb zone) and a small
   "Galereyadan" link. Why a tap here: a browser opens the camera only from a real tap,
   never by itself (Chromium's user-activation rule for file inputs). Java could open the
   camera itself for ~80 more lines; that is v1.5.
3. Tap -> system camera, no permission prompt. Shutter, then the camera's own OK
   (two actions that belong to the camera app).
4. Back in the page: STATE P with the thumbnail, "Chekni o'qiyapman...". The page shrinks
   the JPEG to <= 1600 px on the long side before upload. POST `/api/capture/photo` with a
   `captureId`.
5. STATE D: amount = grand total, category guessed, merchant in the muted line when read.
   Same three fix paths.

Honest count: fingerprint + icon + button + shutter + OK = 5. Receipts are inherently two
actions longer than voice; the photo path wins on accuracy for long receipts, not on speed.

Failure states:
- P-F1 Unreadable / no total -> amber "Chekni o'qiy olmadim" / primary "[cam] Qayta",
  secondary "[pen] Yoz". Nothing saved.
- P-F2 Camera cancelled (Back inside the camera) -> step 2 again, silently.
- P-F3 No network / timeout -> same red card as V-F4; image kept in memory; "Qayta yuborish".
- P-F4 Several totals or a non-so'm currency -> the server picks the grand total, the card
  shows it; wrong -> Tuzatish. No extra UI.

### 3.3 Manual (typed)
1. Tap "Yoz" (pinned, long-press, or secondary). Opens `/capture?mode=text`.
2. Screen = the existing `QuickAddForm` in `bare` mode with three changes: (a) the amount
   field first and focused, `inputmode="numeric"`, live "500 000" grouping; (b) category
   as chips (his 6 most-used this month + "Boshqa..." that opens the full select); (c)
   currency, account, date and note folded under one "Ko'proq" row (defaults: so'm, no
   account, today). Primary "Saqlash" 72px at the bottom, disabled until amount > 0.
3. Tap Saqlash -> POST `/api/transactions` (exists) with a `captureId` -> STATE D.

Failure states:
- M-F1 No network -> red card, form values kept / "Qayta".
- M-F2 Empty amount -> the button simply stays disabled; no red text.
- M-F3 Keyboard did not pop up by itself on his phone -> one tap on the field; not a bug
  to chase in v1.

### Offline - v1 decision: ONLINE ONLY, honestly labelled.
All three modes show the same red "Saqlanmadi" card with "Qayta yuborish"; nothing is
queued. Why: (1) his day runs on mobile data; offline is the metro, for minutes;
(2) a queued item is a "did it save?" doubt, which breaks the done-law - the green screen
must mean the server has it; (3) a real queue = local storage + retry + duplicate handling
+ a "pending" UI = days. v2 candidate if he hits V-F4 more than twice a week: a queue for
typed entries only (tiny JSON), never for audio.

ASSUMPTION: Vercel over 4G in Tashkent gives ~1 s first paint for `/capture` and 3-6 s for the voice round trip.

## 4. WHERE THE REST OF THE APP LIVES

- `/capture` (new: STATES R/P/D/H + the photo and text screens) is the launch URL. Every
  existing route stays exactly where it is: `/` Overview, `/transactions`, `/categories`,
  `/accounts`, `/debts`, `/budgets`, `/reports`, `/analytics`, `/login`.
- Depth 1 (one tap from the capture home): "Bugun . N" / "Hammasi ->" -> `/capture/today`
  (today's rows, newest first; row tap -> the edit form, which carries a small [bin] for
  delete). Top-right [chart] -> `/`, the existing Overview with its TopNav/BottomNav.
- Depth 2: everything the dashboard already links to. Only two one-line additions to the
  dashboard: a "[mic] Yozish" item in BottomNav (mobile) / TopNav (desktop) pointing at
  `/capture`, and `/login` honouring `?next=` so first run returns to the mic.
- The dashboard's AddSheet "+" keeps working; it is the same `QuickAddForm`.
- Hardware Back on `/capture` = the app closes (no in-between screen). Back on `/` =
  `/capture`. WebView history does this by itself.
- Java `onResume` after > 10 min reloads `/capture?mode=voice`, so whatever screen he left
  on, the next open is the mic.
- Database: two nullable columns on Transaction, additive migration, no backfill -
  `captureId` (unique; makes retries idempotent: a second POST with the same id returns
  the existing row, never a twin) and `source` (`app_voice` | `app_photo` | `app_text` |
  `bot` | `web`) so a later report can show which entry path he really uses.
- Desktop web is untouched: `/` remains the dashboard; `/capture` also works in a desktop
  browser (mic and file input behave the same), nothing is app-only.

## 5. CUT LIST (not in v1)

- Offline queue, local-first storage, service-worker caching of any kind.
- Widget, ongoing notification, Quick Settings tile, Assistant/App Actions, image
  share-target, lock-screen no-unlock recording (the Java service, row J).
- Java opening the camera by itself on `mode=photo` (v1.5, ~80 lines).
- Text share-target for bank SMS -> expense (v1.5, ~10 lines Java + one URL param).
- In-app camera viewfinder; live transcript while speaking; on-device speech recognition;
  wake word; continuous listening; spoken read-back.
- Custom numeric keypad, "000" chip, amount slider.
- Onboarding tour, tips, carousel, "rate the app", push notifications, biometric app lock.
- Onboarding strangers, Play Store listing (sideload the APK), iOS, tablet or landscape
  layouts.
- Budget warnings or insights on the done card ("Logistika 80%") - v2, one line, after a
  month of real use.
- Editing categories, accounts, debts or currencies from the capture screens; they stay
  in the dashboard.
- Any change to the LLM prompt, STT chain or receipt reader beyond exposing them as two
  HTTP routes.
- Analytics beyond the `source` column. A dark-mode toggle (the site follows the system).

## OPEN DECISIONS FOR THE OWNER

1. Icon opens ALREADY recording (A) vs opens the home with a big mic button (B: +1 tap
   every time, never records by surprise). Recommend A - the count is the whole point; X
   and the 4-second "heard nothing" stop cover the accidental case.
2. Save without asking, with one-tap undo (A) vs show the result and require a "Saqlash"
   tap (B: +1 tap every time). Recommend A - the parse is right far more often than not,
   and undo is one tap.
3. Which phone: Samsung / Xiaomi / other. Samsung -> Side key double-press opens the app,
   the literal one step at zero cost; Xiaomi and others -> lock-screen or launcher shortcut
   where the OEM allows. One word decides the setup-day checklist, nothing in the code.