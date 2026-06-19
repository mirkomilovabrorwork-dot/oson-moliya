# PulTrack — Backlog & recommendations (prioritized)

> Opus's prioritized recommendations for what to do next, with reasoning. Living doc — pick from the top.
> Live status is in `docs/STATE.md`. Last reviewed: 2026-06-19.

Legend: **[me]** = I (Opus) build it · **[you]** = your action (account/decision/spend) · effort S/M/L.

---

## ▶ NEXT SESSION — Agentic-engineering hardening (START HERE; user's call 2026-06-19)

We're already doing agentic engineering (CLAUDE.md/AGENTS.md · subagents/skills/hooks · spec-first ·
gates · trajectory-review · guardrails · knowledge-hub · feedback-loop). To make the foundations
COMPOUND (not vibe-coding that sinks), close the 3 WEAK pillars — in this order:

1. **Verification depth — do first (highest value, in our control).**
   - **Live-test the shipped bot changes — [you], S.** Verify 046–053 on @oson_moliya_bot (debt-repay,
     Q&A, multi-entry, feedback 2-way + your reply relays, /kirish, multi-edit [1][2][3]). Do NOT build
     more brain features until confirmed. (Same as P0 #1.)
   - **Brain accuracy test set — [me], M.** ~50–100 REAL labeled Uzbek messages → measure classification
     accuracy %; becomes the GATE for any future brain/cost change. The missing "Verification Loops" depth.
     (Same as P0 #3.)

2. **Agentic CI/CD + monitoring — [me], M (the weakest pillar).**
   - **GitHub Actions CI:** on push, auto-run `typecheck + test + build` so gates are enforced by the
     PIPELINE, not just by me. (Workflow must live on the branch GitHub schedules from / main.)
   - **Prod error monitoring:** wrap the bot + API error handlers to DM the owner (FEEDBACK_CHAT_ID
     8582045913) on uncaught errors (or a free Sentry) → we LEARN when prod breaks instead of users telling us.
   - *(Optional)* Vercel git-integration auto-deploy on merge vs the current manual `vercel --prod`.

3. **Sandboxing / isolation — [me], S (decide).**
   - Parallel agents currently share ONE worktree + a one-writer-per-file lock (works, but a clash risk).
     Option: use the Workflow tool's `isolation: "worktree"` (per-agent worktree) for parallel file-writers.
     Decide: adopt per-agent isolation OR keep the file-lock discipline (fine at our scale) — and document it.

> Closing these = the demo doesn't sink; foundations compound. Then resume P0/P1/P2 below.

---

## P0 — do first (highest value / risk)

1. **LIVE-TEST the bot-brain changes shipped this session — [you], S.**
   Tasks 046/047/048/052/053 (debt-repay by voice, finance Q&A, multi-entry, feedback, /kirish, multi-edit)
   are deployed but UNVERIFIED on the real bot. Send real messages on @oson_moliya_bot:
   "Sarvar 2 mln qaytardi" · "qancha pulim bor" · "eng katta xarajatim" · "non 10 ming, taksi 20 ming,
   oylik 5 mln" → Tahrirlash → [1] · /feedback (does it reach you, id 8582045913?) → reply → relays back · /kirish.
   *Why first:* we shipped a lot of classifier changes; a regression here hurts real users. Rollback = redeploy `32476d8`.

2. **Keep-warm monitor — [you], S.** Point a free UptimeRobot / cron-job.org HTTP monitor at
   `oson-moliya.vercel.app/api/health` every 5 min. *Why:* Neon suspends after ~5min idle → cold-start slowness.
   The endpoint is already built; this is a 2-min signup. (Skeleton already hides the "looks broken" feeling.)

3. **Brain accuracy test set — [me], M.** ~50-100 REAL Uzbek messages, hand-labeled (expected intent/amount/
   category/direction) → a test that measures how often the brain classifies correctly. *Why:* this is the #1
   gap — we have unit tests but NO measured real-world accuracy on a low-resource language. It also becomes the
   safety net for any future cost change (fast-path / cheaper model): change nothing until accuracy holds.

---

## P1 — next (clear value, build when ready)

4. **Code-first fast-path (cost lever) — [me], M.** Parse clear "amount + keyword" messages deterministically
   (reuse the amount parser + the category-keyword map), SKIP the LLM; fall back to Haiku only when unsure.
   ~50-70% fewer LLM calls, zero accuracy loss IF conservative (gate on the accuracy set #3 first). *Why later:*
   Haiku is already ~$0.002/msg; this matters at scale + needs careful, measured work. KEEP Haiku as the brain.

5. **confidence-based confirmation — [me], S.** The brain returns a confidence score that the dispatch ignores.
   When it's low, ask "shumi?" (confirm) instead of logging directly. *Why:* cuts wrong auto-logs cheaply.

6. **Daily reminder / summary — [me], M.** Opt-in (a /more toggle) evening (≈21:00 Tashkent) message via a
   Vercel daily cron: "Bugun: N yozuv · −X · naqd Y". *Why:* habit-building + engagement; templated → ~0 token
   (fits the free tier). Must be opt-out-able so it never feels like spam.

7. **Premium plan (monetization) — [you]+[me], M.** FREE = ~0-token features (text logging via fast-path,
   dashboard, queries); PREMIUM = money-costing features (voice STT, photo/receipt vision). *Why:* avoid loss +
   small profit once there are users. Decide price/limits (yours); I wire the gating. Build after a user base exists.

---

## P2 — later / nice-to-have

8. **Full bot-rebind recovery — [me], M.** Today login+password recovers WEB access only; binding a NEW
   telegramId to an old account (so the BOT also picks up the old data after losing Telegram) is unbuilt. v2 of
   the recovery anchor. *Why later:* the rare case; web recovery + export already prevents data loss.

9. **Email reset for forgot-password — [me], S/M.** Optional email at protection-setup → self-service password
   reset (so forgot-password doesn't always need support). *Why later:* support channel (/feedback→you) covers
   the rare case now; email adds a field most won't use.

10. **Announce the latest updates to users — [you]/[me], S.** Draft is ready (qarz-by-voice, Q&A, multi-entry,
    login+password, backup/feedback). Deliver via an owner-only `/announce` broadcast OR manually. *Why later:*
    do it once the user base is worth announcing to.

11. **Provider spend caps — [you], S.** Set hard monthly caps on Anthropic / Gemini / Groq dashboards. *Why:*
    runaway-bill insurance (a loop/abuse can't bankrupt you). Not urgent at low volume, but cheap peace of mind.

12. **Error monitoring — [me], S.** Today prod errors only hit `console.error` (Vercel logs). A lightweight
    error tracker (or a bot-DM on uncaught errors) means you LEARN when prod breaks instead of users telling you.

13. **Garbled-STT robustness — [me], S.** Voice mis-transcription → wrong log. Pair with #5 (confirm on low
    confidence) or a light sanity-check before logging a voice-derived entry.

14. **Desktop-width polish — [me], S.** The app is mobile-first (correct for Telegram). If you push it as a
    web product, widen a few pages + scale charts for big screens. *Why later:* only if web-first becomes a goal.

15. **Security: rotate the embedded GitHub PAT — [you], S.** The `origin` remote URL embeds a token (standing
    note). Rotate it for hygiene. (You previously said "shartmas" — leaving here as a reminder.)

---

## Done this session (for reference) — see docs/STATE.md
Tasks 044–055: spam cap · JSON backup · bot debt-repay · finance-secretary Q&A · multi-entry (+debts) ·
login+password recovery (+WHY) · de-emoji→Lucide icons · perf (query-batch + /api/health) · bot feedback
(2-way) + /kirish + multi-edit · typing indicator · instant loading skeletons.
