# Oson Moliya — Demo Script (Screen Recording)

Target runtime: ~4–5 minutes. Record at 1080p or higher. No narration needed — on-screen
flow and bot text speak for themselves. Suggested tool: OBS Studio or Windows Game Bar (`Win + G`).

---

## Before recording — checklist

1. Use a clean/fresh demo Telegram account (zero transactions, zero categories) — totals reconcile
   and every "new record appears" beat is obvious. The app and bot share one Neon DB; clear any
   stray test rows before you start.
2. Close DevTools / Network panel before hitting Record — no cookies or URLs on camera.
3. Open **@oson_moliya_bot** in the Telegram mobile app (phone) — the bot is live at that username.
4. Open the **Oson Moliya dashboard** by tapping the app's **Menu button** (bottom-left in Telegram)
   or the `📊 Moliyachi` web_app button that the bot sends after each confirmation.
   Auth happens automatically via Telegram initData — there is no login screen and no magic-link.
5. Pre-test voice BEFORE recording: send the recording phrase 3× on prod and confirm each round-trip
   completes in under ~15s. If any trip is slower, record the main expense-log scene via TEXT and
   add voice as a short secondary clip only.
6. Never say a foreign-currency amount on camera (e.g. "dollar", "yevro", "rubl") — say amounts
   in so'm only.
7. Keep the entire recording in Uzbek (uz) — mixing languages causes the bot to auto-switch per message.
8. Single-send each message (one tap — no double-tap); never delete a category on camera.

---

## Step-by-step recording flow

### Scene 1 — Clarify beat: unclear amount (0:00 – 1:00)
*This proves rubric #6 (follow-up when unclear). Record it first — it is not optional.*

1. In Telegram, send the text message (or short voice):
   > **"logistikaga chiqim"** *(no amount)*
2. The bot asks for the missing field:
   > **"Qancha so'm?"**
3. Reply with:
   > **"500 ming"**
4. The bot confirms:
   > ✅ Yozildi: 500 000 so'm, chiqim, Logistika, bugun.
   *(Exact format: `✅ Yozildi: {amount} so'm, {type}, {category}, {date}.`)*
5. The bot also sends a `📊 Moliyachi` button (web_app). Tap it.
6. The dashboard opens inside Telegram. Scroll Home — the 500 000 so'm expense is visible in
   "So'nggi yozuvlar" and the "Bu oy natijasi" hero has updated. Hold on this view for 2–3 seconds.

> **After every bot save: explicitly reload/re-open the dashboard** (server-rendered, no live poll)
> so the new record is visibly on camera.

---

### Scene 2 — Voice expense log (1:00 – 2:00)
*Shows voice + STT. Only record this scene if prod round-trips are under ~15s (pre-test above).*

7. Press and hold the Telegram microphone button. Say (≤4 words, pre-tested):
   > **"Do'konga besh yuz ming"**
   *(or another short Uzbek phrase you confirmed works 3× on prod)*
8. Release. The bot shows a **typing indicator** (silent — no text, auto-expires ~5s).
9. The bot echoes:
   > 🎤 *Do'konga besh yuz ming*
10. The bot then confirms:
    > ✅ Yozildi: 500 000 so'm, chiqim, Do'kon, bugun.
    *(Exact same `✅ Yozildi: …` format as text.)*
11. Pause 2 seconds on the confirmation message. Then tap `📊 Moliyachi`, reload, and show the
    new row in Yozuvlar.

> **If voice fails on camera:** continue with text. Voice is a bonus clip, not the demo's core.

---

### Scene 3 — Text correction and delete (2:00 – 2:45)
*Proves rubric #8 (correction/deletion). Record immediately after Scene 2 with NO clarify step in between — this avoids the R1b collision where a pending clarify wipes the last-tx reference.*

12. Send the text message:
    > **"oxirgisini 900 ming deb tuzat"**
13. The bot corrects the last record and replies:
    > ✏️ Tuzatildi: 900 000 so'm, chiqim, Do'kon, bugun.
14. Reload the dashboard — the updated amount is visible.
15. Now send:
    > **"o'chir"**
16. The bot soft-deletes the last record and replies:
    > 🗑️ O'chirildi.
17. Reload the dashboard — the row is gone.

---

### Scene 4 — Navigate the dashboard (2:45 – 3:30)

18. From Home, tap **Yozuvlar** in the bottom nav.
    The list shows the remaining records (only Scene 1's 500 000 so'm expense — Scene 2's was deleted).
19. Tap the **filter bar** — filter by today's date; the row stays visible.
    Tap the **pencil** icon on the row. Change the note to "Yetkazib berish". Save — the row updates inline.
20. Tap **Yana** in the bottom nav.
    Under Yana: show **Kategoriyalar** — tap it. The Logistika / Do'kon categories are visible.
    Show **Mavzu** (theme toggle) and **Til** (language switcher) — both are under Yana, NOT top-right.
    Do NOT delete any category on camera.

---

### Scene 5 — Analytics (3:30 – 4:00)

21. Tap back to Home, then navigate to **Yana → Analitika** (or the Analytics tab if visible).
22. The **Kirim/Chiqim** bar chart shows the current month's columns.
23. The **Category breakdown** shows Logistika as the dominant expense slice.

---

### Scene 6 — Budget alert (4:00 – 5:00)
*Deliberately trip the budget limit so the `>=` boundary fires and the alert appears on camera.*

24. Go to **Yana → Kategoriyalar**. Find "Logistika". Tap **Byudjet** / **Set budget**.
    Enter `300 000`. Save. A budget progress bar appears (current spend 500 000 so'm vs 300 000 limit —
    it is already over; the alert fires on the NEXT bot save).
25. Switch back to Telegram. Send:
    > **"Logistikaga yana ikki yuz ming chiqim"**
26. The bot confirms:
    > ✅ Yozildi: 200 000 so'm, chiqim, Logistika, bugun.
    Immediately after:
    > ⚠️ Eslatma: "Logistika" bo'yicha bu oy {X} so'm sarfladingiz — 300 000 so'm limitidan oshdi.
    *(Exact format from `formatBudgetAlert` in reply.ts)*
27. Pause 3 seconds on the alert. Then reload the dashboard and scroll Home to show the updated total.

---

## Bot reply reference — exact shipped strings

| Situation | Bot output |
|---|---|
| Voice received | `typing` chat action (silent, ~5s) → `🎤 {transcript}` |
| Successful save | `✅ Yozildi: {amount} so'm, {type}, {category}, {dateLabel}.` |
| Clarify (missing field) | e.g. `Qancha so'm?` (Claude's generated question) |
| Correction | `✏️ Tuzatildi: {amount} so'm, {type}, {category}, {dateLabel}.` |
| Delete | `🗑️ O'chirildi.` |
| Budget exceeded | `⚠️ Eslatma: "{category}" bo'yicha bu oy {spent} sarfladingiz — {limit} limitidan oshdi.` |
| Dashboard button | `📊 Moliyachi` (web_app, opens Mini App in-Telegram) |

---

## Navigation reference — live app layout

| Where to find it | How |
|---|---|
| Home (balance hero + recent) | Bottom nav: **Bosh sahifa** |
| Transaction list | Bottom nav: **Yozuvlar** |
| Debts (coming soon) | Bottom nav: **Qarzlar** (shows "Tez orada") |
| Categories, theme, language | Bottom nav: **Yana** → then the item |
| Quick-add | **FAB** (+ button, bottom-right) |
| Analytics | Yana → Analitika |

---

## Sample messages — Uzbek only (keep recording single-language)

| Intent | Message |
|---|---|
| Expense with category | `Mahsulot uchun yuz ming chiqim` |
| Income | `Bugun sotuvdan ikki million tushdi` |
| Unclear amount (triggers clarify) | `Do'konga chiqim` |
| Correction | `Oxirgisini besh yuz ming deb tuzat` |
| Delete | `O'chir` |
| Finance query | `Bu oyda jami chiqimlarim qancha?` |

---

## Edge cases (optional, time permitting)

- **Foreign-currency guard:** send `"yuz dollar to'ladim"` → bot asks for the so'm amount instead of
  logging 100 so'm silently. (Requires P0-E guard to be deployed.)
- **Duplicate-send test:** send the same message twice quickly → only ONE record appears on the dashboard.
  (Requires P0-E update_id idempotency guard.)

---

## Recording hygiene summary

- Clean account → zero stray rows.
- Reload dashboard after EVERY bot save → new record on camera.
- Single-send per message → no double-tap.
- Amounts in so'm only → no foreign currency on camera.
- uz only → no language auto-flip mid-recording.
- DevTools closed → no cookies/URLs on camera.
- Do NOT delete a category on camera.
- Correction/delete: do it IMMEDIATELY after the save (no clarify step in between).
- Voice: pre-test 3× on prod; use ≤4-word phrase; text is the fallback.
