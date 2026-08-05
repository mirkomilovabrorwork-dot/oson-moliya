# Deploy log

One line per production deploy: `<ISO timestamp> <commit sha> <what shipped>`.

2026-08-05T03:54:46Z c562e8a security headers (nosniff, Referrer-Policy, Permissions-Policy, CSP frame-ancestors) + tighter voice rate limit (8/10min). First prod deploy in 38 days. Alias oson-moliya.vercel.app had to be moved manually (`vercel alias set`) — `vercel --prod` created the production deployment but did NOT move the alias. Live-verified: 4 headers present, X-Frame-Options absent (Telegram Mini App), /api/telegram 405, webhook healthy (0 pending, no last_error).
