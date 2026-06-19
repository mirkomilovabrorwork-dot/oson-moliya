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

  const DANGEROUS = [
    // --- destructive git ---
    [/git\s+push\b[^|&;]*(--force\b|--force-with-lease\b|(\s|^)-f\b)/, "force-push"],
    [/git\s+push\b[^|&;]*--mirror\b/, "push --mirror"],
    [/git\s+push\b[^|&;]*--delete\b/, "push --delete (remote branch deletion)"],
    [/git\s+push\b[^|&;]*(\s|^):/, "push :branch (remote branch deletion)"],
    [/\bgit\s+reset\b[^|&;]*--hard\b/, "git reset --hard"],
    [/\bgit\s+clean\b[^|&;]*-[a-zA-Z]*f/, "git clean -f (deletes untracked files)"],
    [/\bgit\s+branch\b[^|&;]*\s-D\b/, "git branch -D (force-delete branch)"],
    [/\bgit\s+checkout\b[^|&;]*(--\s+)?\.(\s|$)/, "git checkout . (discards changes)"],
    [/\bgit\s+restore\b[^|&;]*(--\s+)?\.(\s|$)/, "git restore . (discards changes)"],
    // --- irreversible prod / data actions ---
    [/\bvercel\b[^|&;]*--prod\b/, "vercel --prod (production deploy)"],
    [/--accept-data-loss\b/, "prisma --accept-data-loss (destructive DB change)"],
    [/\bprisma\s+migrate\s+(deploy|reset)\b/, "prisma migrate deploy/reset"],
  ];

  for (const [re, label] of DANGEROUS) {
    if (re.test(cmd)) {
      process.stderr.write(
        `BLOCKED by guardrail [${label}]: "${cmd}"\n` +
          `This is an irreversible/destructive command. It requires a deliberate, explicit human action — ` +
          `Claude is not permitted to run it. If you truly need this, the user must run it themselves.\n`
      );
      process.exit(2);
    }
  }
  process.exit(0);
});
