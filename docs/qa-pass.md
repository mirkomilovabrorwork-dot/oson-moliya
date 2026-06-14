# Pre-submission QA — run once on a phone against PROD (@oson_moliya_bot + oson-moliya.vercel.app)

Mark each ✅/❌ before recording the demo. (MASTER_PLAN §6 P0-QA.)

## Bot (Telegram)
| # | Send / do | Expected | OK? |
|---|---|---|---|
| 1 | Voice: "logistikaga besh yuz ming chiqim" | 🎤 transcript (Uzbek, NOT Turkish/Arabic) → ✅ Yozildi: logistika | |
| 2 | Text income: "2 mln sotuv" | ✅ Yozildi: sotuv, +2 000 000 so'm | |
| 3 | Unclear amount: "logistikaga chiqim" | Asks "Qancha so'm?" (no silent save) | |
| 4 | Foreign currency: "100 dollar" | Asks to clarify — does NOT log 100 so'm | |
| 5 | "5000 som lavash" | Auto-categorizes to **Oziq-ovqat** WITHOUT asking | |
| 6 | Ambiguous item the AI can't place | Shows closest **category buttons** + ✏️ Boshqa | |
| 7 | Type unclear (e.g. "50 ming lavash") | Shows **[🟢 Kirim] [🔴 Chiqim]** → tap completes save | |
| 8 | After a save, tap **[🗑 O'chirish]** → **[Ha, o'chir]** | Record soft-deleted, "🗑 O'chirildi" | |
| 9 | Text: "oxirgisini o'chir" | Deletes last record | |
| 10 | "oxirgisini 900 ming deb tuzat" | Corrects the last record | |
| 11 | Finance query: "hisobot" | Income / Expense / **Sof (kirim−chiqim)** — NOT "Balans" | |
| 12 | Budget: set a small limit on a category, then exceed it via bot | ⚠️ budget-exceeded alert fires (once/month) | |
| 13 | Switch to Russian/English message | Bot replies in that language | |
| KNOWN | Send the SAME message twice fast | MAY create 2 records (idempotency deferred) → **single-send in the demo** | — |

## Dashboard (open via the bot's "📊 Moliyachi" WebApp button)
| # | Check | Expected | OK? |
|---|---|---|---|
| 14 | Open **Yozuvlar** page, then reload | Theme stays **dark** (does NOT flip to light) — hydration fix | |
| 15 | Money in lists | "−500 000 so'm" (space before so'm, signed, colored) | |
| 16 | Enter Kategoriyalar / Tahlil, press **back** | Returns to previous screen (does NOT exit the app) | |
| 17 | Home hero | "**Bu oy natijasi**" (not "Umumiy balans") + income/expense + period delta | |
| 18 | Edit/delete buttons on a row | Tappable (≥44px), work | |
| 19 | Switch language uz→ru→en (Yana) | No missing keys / mojibake | |
| 20 | Fresh/empty state | Onboarding guidance, no crash on empty charts | |

## Submission checklist
- [ ] Repo PUBLIC ✅ (verified)
- [ ] Live bot replies + dashboard opens
- [ ] Provider spend caps set on Anthropic + Groq keys (bot is public → prevent abuse draining keys)
- [ ] Demo video recorded from PROD per docs/demo-script.md (voice → bot → dashboard update + budget alert)
- [ ] README links work in an incognito browser
