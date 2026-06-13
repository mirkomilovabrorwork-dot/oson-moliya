# PulTrack — Demo Script (Screen Recording)

Target runtime: ~3–4 minutes. Record at 1080p or higher. No narration needed — the on-screen flow speaks for itself. Suggested tool: OBS Studio or Windows Game Bar (`Win + G`).

---

## Setup before recording

1. Ensure `.env.local` has real keys: `TELEGRAM_BOT_TOKEN`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `DATABASE_URL`, `APP_URL` (the live Vercel URL).
2. Database should have zero transactions so the flow is clean (or create a fresh test user).
3. Dashboard open in browser at `APP_URL`, bot open in Telegram on the same screen (split or alt-tab).
4. Telegram desktop client open (shows voice messages and inline buttons).

---

## Step-by-step recording flow

### Scene 1 — Voice expense log (0:00 – 0:45)

1. In Telegram, press and hold the microphone button. Say in Uzbek:
   > **"Logistikaga besh yuz ming so'm chiqim bo'ldi"**
2. Release. The bot immediately sends a typing indicator (⏳ tinglayapman…).
3. The bot replies with the transcription echo and confirmation:
   > 🎤 *Logistikaga besh yuz ming so'm chiqim bo'ldi*
   > ✅ Yozildi: **500 000 so'm chiqim — Logistika**, bugun.
   > [📊 Dashboard →]
4. Pause 2 seconds on the confirmation message so viewers can read it.

### Scene 2 — Open dashboard via bot button (0:45 – 1:10)

5. Tap the **📊 Dashboard →** inline button in the bot reply.
6. The browser opens the dashboard (magic-link authentication, no login screen).
7. The **Overview** page loads: the 500 000 so'm expense appears in the "This month" stat card and the quick summary below.

### Scene 3 — Transactions page (1:10 – 1:30)

8. Click **Transactions** in the top navigation.
9. The table shows the new entry: date, type (expense), category (Logistika), amount (500 000 so'm).
10. Scroll to show the filter bar — click the **Category** filter, select "Logistika". The table filters in place.
11. Click the pencil (edit) icon on the row. Change the note to "Yetkazib berish, iyun 13". Save. The row updates inline.

### Scene 4 — Analytics page (1:30 – 2:00)

12. Click **Analytics** in the nav.
13. The **Income vs Expense** bar chart shows the current month's columns.
14. The **Category pie chart** shows Logistika as the dominant expense slice.
15. Select **Last month** from the period selector — the charts update with last-month data (or show an empty state if none).

### Scene 5 — Set a budget limit (2:00 – 2:20)

16. Click **Categories** in the nav.
17. Find the "Logistika" expense category. Click **Set budget**.
18. Enter `300 000` (so'm). Save. A green budget-progress bar appears showing current spend vs limit.

### Scene 6 — Exceed the budget via the bot (2:20 – 2:50)

19. Switch back to Telegram. Send a text message:
    > **"Logistikaga yana 200 ming chiqim"**
20. Bot confirms: ✅ Yozildi: **200 000 so'm chiqim — Logistika**, bugun.
21. Immediately after: the bot sends a proactive alert:
    > ⚠️ **Logistika** oylik byudjeti (300 000 so'm) oshib ketdi. Hozirgi xarajat: 700 000 so'm.
22. Pause 3 seconds on the alert message.

### Scene 7 — Language switch (2:50 – 3:20)

23. Switch back to the browser (Overview or Transactions page).
24. In the top-right corner, click the language switcher: **UZ → RU**.
25. The page reloads in Russian: "Обзор", "Транзакции", "Аналитика", "Категории".
26. Click **EN**. Page reloads in English: "Overview", "Transactions", "Analytics", "Categories".
27. Click **UZ** to return. End recording.

---

## Sample messages — realistic inputs for each language

### Uzbek (uz)

| Intent | Message |
|---|---|
| Income (sale) | `Bugun sotuvdan 2 million 500 ming tushdi` |
| Expense | `Mahsulot uchun 1 mln 200 ming to'ladik` |
| Query | `Bu oyda jami chiqimlarim qancha?` |

### Russian (ru)

| Intent | Message |
|---|---|
| Income (sale) | `Сегодня продали на 3 миллиона сумов` |
| Expense | `Аренда за июнь — 1 500 000 сум` |
| Query | `Сколько потратили на логистику в этом месяце?` |

### English (en)

| Intent | Message |
|---|---|
| Income (sale) | `Got paid 4 million soums for the delivery contract` |
| Expense | `Paid 800 thousand for utilities today` |
| Query | `Show me this month's report` |

---

## Edge cases worth showing (optional, time permitting)

- **Foreign currency guard:** send `"100 dollar to'ladim"` → bot asks: "Iltimos, summani so'mda kiriting" (no guess).
- **Correction:** send `"Oxirgisini 900 ming deb tuzat"` → bot patches the last transaction and confirms.
- **Voice in Russian:** hold mic, say "Сегодня продали на два миллиона" → bot transcribes and confirms in Russian.
