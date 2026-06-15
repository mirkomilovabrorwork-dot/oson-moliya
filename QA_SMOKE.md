# QA Smoke Gate — PulTrack (Step 2)

> Goal: prove the build is not broken-broken. Evidence = real command output / live HTTP.

| Smoke # | Check | Status | Evidence | Notes |
|---|---|---|---|---|
| S1 | Typecheck clean | ✅ | `npm run typecheck` → `tsc --noEmit`, 0 errors | |
| S2 | Unit tests pass | ✅ | `npm test` → vitest 104/104 (8 suites) | |
| S3 | Production build compiles all routes | ✅ | `next build` OK — 27 routes (`/`, `/transactions`, `/analytics`, `/categories`, `/accounts`, `/debts`, `/converter`, `/more`, `/login`, `/onboarding` + 17 API/`/api/*`) all server-render without build error | proves every page/route compiles |
| S4 | Live `/login` reachable | ✅ | `GET https://oson-moliya.vercel.app/login` → **200** | unauthenticated entry page |
| S5 | Auth guard redirects unauth `/` | ✅ | `GET /` (no session) → **307** → `/login` | proxy session guard works |
| S6 | Home renders (authenticated) | ⏳ Unverified | build compiles `/` (S3); runtime not driven | no dev-auth bypass; Preview MCP is bound to the session worktree, not the `pultrack` repo |
| S7 | Each nav screen loads (authed) | ⏳ Unverified | all routes compile (S3) | runtime UI needs a real session |
| S8 | Bot happy path (log an expense) | ⏳ Unverified | code-audited (Step 1) | driving the live bot spends real Anthropic/ElevenLabs credit + writes prod DB → unsafe per QA rules |
| S9 | Data persists on kill & relaunch | ⏳ Unverified | DB-backed (Neon) by design; session cookie persists | needs authed session to observe |

**Result: 5 of 5 reachable checks passed; 4 UI/bot checks Unverified (reasons above). No ❌ failures → build is not broken-broken.**

## Gate decision
- No ❌. Build health + live reachability + auth guard all green. → **Smoke passed; proceed to Step 3.**
- The 4 Unverified checks carry into Step 3 as runtime-Unverified (compensated by code-audit + build-compile + live-endpoint evidence).
