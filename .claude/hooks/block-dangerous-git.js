#!/usr/bin/env node
/**
 * PreToolUse guardrail (Guardrails pillar) — blocks IRREVERSIBLE / destructive commands.
 *
 * Philosophy: "a guardrail is a hook that BLOCKS, not prose that asks nicely."
 * We block only commands that are hard/impossible to undo. Normal `git push` / `git commit`
 * are ALLOWED (the main session legitimately pushes as GitHub backup).
 *
 * jq-free + node-based for Windows reliability. Errors OPEN (never blocks on its own failure)
 * — it is defense-in-depth, not the only safety line.
 *
 * Exit 2 = block (stderr is shown to Claude). Exit 0 = allow.
 */
let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  let cmd = "";
  try {
    cmd = ((JSON.parse(input) || {}).tool_input || {}).command || "";
  } catch {
    process.exit(0); // unparseable → don't block
  }
  if (!cmd) process.exit(0);

  // A prod DEPLOY is "authorizable": still blocked by default (no accidental/automatic
  // deploys), but allowed when the command carries a DELIBERATE inline marker
  // "# deploy-authorized". User pref 2026-06-20: "asking is enough, then just do it" —
  // so an explicitly user-authorized deploy goes through, while a stray one cannot.
  // Destructive git / DB-data-loss are NEVER authorizable here (human-only).
  const deployAuthorized = /#\s*deploy-authorized\b/.test(cmd);

  // [regex, label, authorizable]
  const DANGEROUS = [
    // --- destructive git (always blocked) ---
    [/git\s+push\b[^|&;]*(--force\b|--force-with-lease\b|(\s|^)-f\b)/, "force-push", false],
    [/git\s+push\b[^|&;]*--mirror\b/, "push --mirror", false],
    [/git\s+push\b[^|&;]*--delete\b/, "push --delete (remote branch deletion)", false],
    [/git\s+push\b[^|&;]*(\s|^):/, "push :branch (remote branch deletion)", false],
    [/\bgit\s+reset\b[^|&;]*--hard\b/, "git reset --hard", false],
    [/\bgit\s+clean\b[^|&;]*-[a-zA-Z]*f/, "git clean -f (deletes untracked files)", false],
    [/\bgit\s+branch\b[^|&;]*\s-D\b/, "git branch -D (force-delete branch)", false],
    [/\bgit\s+checkout\b[^|&;]*(--\s+)?\.(\s|$)/, "git checkout . (discards changes)", false],
    [/\bgit\s+restore\b[^|&;]*(--\s+)?\.(\s|$)/, "git restore . (discards changes)", false],
    // --- irreversible prod / data actions ---
    [/\bvercel\b[^|&;]*--prod\b/, "vercel --prod (production deploy)", true],
    [/\bvercel\s+(promote|rollout)\b/, "vercel promote/rollout (production)", true],
    [/--accept-data-loss\b/, "prisma --accept-data-loss (destructive DB change)", false],
    [/\bprisma\s+migrate\s+(deploy|reset)\b/, "prisma migrate deploy/reset", false],
  ];

  for (const [re, label, authorizable] of DANGEROUS) {
    if (re.test(cmd)) {
      if (authorizable && deployAuthorized) break; // explicit user-authorized deploy → allow
      const hint = authorizable
        ? `If the user has explicitly authorized this deploy, re-run with an inline "# deploy-authorized" marker.\n`
        : `It requires a deliberate human action — Claude is not permitted to run it; the user must run it themselves.\n`;
      process.stderr.write(`BLOCKED by guardrail [${label}]: "${cmd}"\n` + hint);
      process.exit(2);
    }
  }
  process.exit(0);
});
