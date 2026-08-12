# Deploy log

One line per production deploy: `<ISO timestamp> <commit sha> <what shipped>`.

2026-08-05T03:54:46Z c562e8a security headers (nosniff, Referrer-Policy, Permissions-Policy, CSP frame-ancestors) + tighter voice rate limit (8/10min). First prod deploy in 38 days. Alias oson-moliya.vercel.app had to be moved manually (`vercel alias set`) — `vercel --prod` created the production deployment but did NOT move the alias. Live-verified: 4 headers present, X-Frame-Options absent (Telegram Mini App), /api/telegram 405, webhook healthy (0 pending, no last_error).

2026-08-12T14:05Z e75ecc0 debts: fixed the owner-reported "settle/repay then save does nothing" (settleDebt/updateDebt returned a row without paidUzs -> BigInt(undefined) threw outside try/catch = silent no-save). Added src/lib/money-input.ts as the single amount normalizer. Blind non-author review caught 3 defects in the first version of this fix (sign-flip on negatives, 100x on decimals, zero-balance accounts un-renameable) - all fixed and asserted before shipping. Live-proven on the deployed build: settle 200 with paidUzs present, zero-balance rename 200, junk amount 422; test rows deleted. Alias oson-moliya.vercel.app AGAIN had to be moved by hand after `vercel --prod` - this is now twice, treat it as the norm.
