# Three More Days — What Would Ship Next

Given three additional days, the priorities in rough order would be:

- **Teams / multi-user workspaces.** The data model already has per-user isolation; the next step is a `Workspace` entity with owner + member roles, shared categories and budgets, and a permission layer on every API route. An invite link (similar to the existing magic-link pattern) would let a business owner add an accountant or partner without passwords.

- **Recurring transactions.** Most SMB expenses — rent, salaries, utilities — happen on a fixed schedule. A `RecurringRule` table (category, amount, frequency, nextDue) plus a lightweight daily Vercel Cron job (`/api/cron/apply-recurring`) would log them automatically and notify the owner via Telegram. Zero additional input after setup.

- **Receipt-photo OCR.** Users could send a photo of a receipt in Telegram; the server would pass it to Claude's vision capability to extract merchant, amount, date, and category, then run the same confirmation loop as a text message. This closes the last gap between paper receipts and digital records.

- **PDF / Excel export.** A `/api/export?from=&to=&format=xlsx|pdf` route would generate a formatted statement (Recharts charts embedded in PDF, proper column formatting in Excel) so owners can share data with an accountant or tax office without copy-pasting.

- **Scheduled monthly budget digests.** A Vercel Cron job on the first of each month would send every user a Telegram message summarizing the previous month: total income, total expense, net, which categories were over budget, and a dashboard link. Currently budget alerts fire inline (at transaction time); the digest adds a scheduled recap.

- **Full cross-language category mapping.** Right now the prompt instructs Claude to reuse the nearest existing category name; a complete solution would maintain a synonym table (logistika = логистика = logistics = yetkazib berish) so categories converge across languages deterministically rather than relying on model judgment.

- **Auto-fallback to OpenAI STT on low Whisper confidence.** The STT interface is already swappable; the missing piece is a confidence threshold: if Groq Whisper returns a low-confidence transcript (detectable from its JSON metadata), silently retry with `gpt-4o-transcribe` before presenting the result to the user. This would meaningfully improve accuracy for heavily Uzbek-accented audio.
