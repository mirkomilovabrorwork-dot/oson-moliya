# Three More Days — What Would Ship Next

Given three additional days, the priorities in rough order would be:

- **Teams / multi-user workspaces.** The data model already has per-user isolation; the next step is a `Workspace` entity with owner + member roles, shared categories and budgets, and a permission layer on every API route. An invite link (similar to the existing magic-link pattern) would let a business owner add an accountant or partner without passwords.

- **Recurring transactions.** Most SMB expenses — rent, salaries, utilities — happen on a fixed schedule. A `RecurringRule` table (category, amount, frequency, nextDue) plus a lightweight daily Vercel Cron job (`/api/cron/apply-recurring`) would log them automatically and notify the owner via Telegram. Zero additional input after setup.

- **Transfers and reconciliation.** Accounts exist now, but moving money between cash/card/bank should be a first-class transfer, not income or expense. Add transfer records, daily cash close, and reconciliation against account balances so a bookkeeper can explain the numbers at day end.

- **PDF / Excel export.** A `/api/export?from=&to=&format=xlsx|pdf` route would generate a formatted statement (Recharts charts embedded in PDF, proper column formatting in Excel) so owners can share data with an accountant or tax office without copy-pasting.

- **Scheduled monthly budget digests.** A Vercel Cron job on the first of each month would send every user a Telegram message summarizing the previous month: total income, total expense, net, which categories were over budget, and a dashboard link. Currently budget alerts fire inline (at transaction time); the digest adds a scheduled recap.

- **Full cross-language category mapping.** Right now the prompt instructs Claude to reuse the nearest existing category name; a complete solution would maintain a synonym table (logistika = логистика = logistics = yetkazib berish) so categories converge across languages deterministically rather than relying on model judgment.

- **STT confidence fallback.** The STT interface is already swappable; the next step is an A/B confidence fallback: if ElevenLabs returns a weak or suspicious Uzbek transcript, retry with OpenAI `gpt-4o-transcribe` or Groq Whisper before sending the text to the finance brain.
