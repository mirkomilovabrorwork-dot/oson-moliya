# Task 021 - Design and login-code experiment handoff

## Current state

Branch: `design/experiment-2026-06-14`.

Stable rollback point:
- `checkpoint/current-stable-2026-06-14`
- `checkpoint-current-stable-2026-06-14`

Rollback command:

```bash
git switch checkpoint/current-stable-2026-06-14
```

Do not deploy this experiment unless the user explicitly says the design is successful or asks to publish it.

## What Codex changed in this experiment

1. Visual direction changed toward the reference Telegram Mini App style the user liked:
   - light-first warm mint background;
   - deep emerald primary;
   - soft cards with clear borders and restrained shadows;
   - floating mobile navigation;
   - less harsh dark-first finance dashboard feeling.

2. Login now has a fallback code flow:
   - bot `/login`, `/dashboard`, and `/start login` issue a 6-digit one-time code;
   - website login page accepts that code through `/api/auth/code`;
   - existing Telegram Mini App auto-login remains in place;
   - the code expires in 10 minutes, is stored hashed, and is consumed once;
   - login page is responsive: one-column mobile card, two-panel desktop layout.

3. Local dev browser issue fixed:
   - `next.config.ts` allows `127.0.0.1` as a dev origin so in-app browser testing works on `127.0.0.1`.

## If the user approves the design

Treat this as the approved design direction:
- keep the emerald/mint, clean-card, app-like visual system;
- preserve responsive behavior for both phone and desktop;
- continue simplifying screens instead of adding decorative noise;
- use finance terms that are clear for Uzbek SMB users;
- keep Telegram-first login but retain the code fallback because it is easier to explain and demo.

Before deploy:
1. Review all uncommitted files and separate this experiment from unrelated work if needed.
2. Run:
   - `npm run typecheck`
   - `npm test`
   - `npm run build`
3. Browser-smoke `/login` on mobile and desktop.
4. Test real Telegram `/login` on the live bot before telling the user it is ready.
5. Deploy only after user approval.

## If the user rejects the design

Do not patch random colors on top of it. Roll back to the checkpoint branch, then start a new design experiment from there.

## Verification already done locally by Codex

At the time this note was written:
- `npm run typecheck` passed;
- `npm test` passed, 104/104;
- `npm run build` passed;
- browser smoke passed on `http://127.0.0.1:3013/login`;
- mobile width `390px`: no horizontal overflow, login code input visible, submit enables after 6 digits;
- desktop width `1280px`: two panels visible, no horizontal overflow.

