#!/usr/bin/env tsx
/**
 * Brain accuracy eval harness.
 *
 *   npm run eval                 # run all cases
 *   npm run eval -- exp inc      # run only cases whose id contains "exp" or "inc"
 *
 * Calls the REAL Claude API once per case (the configured CLAUDE_MODEL — Haiku by
 * default), so it COSTS a few cents per full run and is non-deterministic. It is
 * deliberately NOT in the default gate / CI. Run it by hand before shipping any
 * brain prompt or model/cost change, and treat a drop in accuracy as a regression.
 *
 * Prints: overall intent accuracy, per-intent breakdown, field-level accuracy,
 * and a table of every miss (expected vs got).
 *
 * Loads secrets from .env.local (ANTHROPIC_API_KEY + CLAUDE_MODEL at minimum).
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { runBrain } from "../src/lib/claude/brain";
import {
  BRAIN_EVAL_CASES,
  DEFAULT_CATEGORIES,
  type BrainEvalCase,
} from "../tests/eval/brain-cases";
import type { RecordIntent } from "../src/lib/claude/tools";

// Run a few in parallel to keep the wall-clock down without hammering rate limits.
const CONCURRENCY = 4;

interface FieldCheck {
  name: string;
  expected: unknown;
  got: unknown;
  ok: boolean;
  /** Soft checks are reported but do NOT fail the case. */
  soft?: boolean;
}

interface CaseResult {
  c: BrainEvalCase;
  intentOk: boolean;
  gotIntent: string;
  fields: FieldCheck[];
  /** A case "passes" when intent matches AND every non-soft field check passes. */
  pass: boolean;
  error?: string;
}

function lc(v: unknown): string {
  return typeof v === "string" ? v.toLowerCase() : String(v ?? "");
}

function checkCase(c: BrainEvalCase, intent: RecordIntent): CaseResult {
  const e = c.expect;
  const intentOk = intent.intent === e.intent;
  const fields: FieldCheck[] = [];

  const add = (name: string, expected: unknown, got: unknown, ok: boolean, soft = false) =>
    fields.push({ name, expected, got, ok, soft });

  if (e.type !== undefined) add("type", e.type, intent.type, intent.type === e.type);

  if (e.amount !== undefined) add("amount", e.amount, intent.amount, intent.amount === e.amount);

  if (e.currency !== undefined)
    add("currency", e.currency, intent.currency, intent.currency === e.currency);

  if (e.originalAmount !== undefined) {
    const orig = (intent as Record<string, unknown>)._originalAmount;
    add("originalAmount", e.originalAmount, orig, orig === e.originalAmount);
  }

  if (e.direction !== undefined)
    add("direction", e.direction, intent.debt_direction, intent.debt_direction === e.direction);

  if (e.counterparty !== undefined)
    add(
      "counterparty",
      e.counterparty,
      intent.counterparty,
      lc(intent.counterparty).includes(e.counterparty.toLowerCase())
    );

  // category is SOFT — reported, never fails the case.
  if (e.category !== undefined)
    add(
      "category",
      e.category,
      intent.category,
      lc(intent.category).includes(e.category.toLowerCase()),
      true
    );

  if (e.metric !== undefined)
    add("metric", e.metric, intent.query?.metric, intent.query?.metric === e.metric);

  if (e.period !== undefined)
    add("period", e.period, intent.query?.period, intent.query?.period === e.period);

  if (e.compareToPrevious !== undefined)
    add(
      "compareToPrevious",
      e.compareToPrevious,
      intent.query?.compareToPrevious,
      intent.query?.compareToPrevious === e.compareToPrevious
    );

  if (e.accountName !== undefined)
    add(
      "accountName",
      e.accountName,
      intent.account_name,
      e.accountName === null
        ? intent.account_name == null
        : lc(intent.account_name).includes(e.accountName.toLowerCase())
    );

  if (e.target !== undefined) add("target", e.target, intent.target, intent.target === e.target);

  if (e.targetAmount !== undefined)
    add("targetAmount", e.targetAmount, intent.targetAmount, intent.targetAmount === e.targetAmount);

  if (e.targetHint !== undefined)
    add(
      "targetHint",
      e.targetHint,
      intent.targetHint,
      lc(intent.targetHint).includes(e.targetHint.toLowerCase())
    );

  if (e.itemsCount !== undefined) {
    const n = Array.isArray(intent.items) ? intent.items.length : 0;
    add("itemsCount", e.itemsCount, n, n === e.itemsCount);
  }

  const pass = intentOk && fields.every((f) => f.soft || f.ok);
  return { c, intentOk, gotIntent: intent.intent, fields, pass };
}

async function runOne(c: BrainEvalCase): Promise<CaseResult> {
  try {
    const { intent } = await runBrain({
      text: c.message,
      user: { id: "eval-user", language: c.lang ?? "uz" },
      categoryNames: DEFAULT_CATEGORIES,
    });
    return checkCase(c, intent);
  } catch (err) {
    return {
      c,
      intentOk: false,
      gotIntent: "ERROR",
      fields: [],
      pass: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Simple bounded-concurrency map (no external deps). */
async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
      process.stdout.write(".");
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function pct(n: number, d: number): string {
  return d === 0 ? "—" : `${((100 * n) / d).toFixed(1)}%`;
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("✖ ANTHROPIC_API_KEY missing — add it to .env.local before running the eval.");
    process.exit(1);
  }

  const filters = process.argv.slice(2).map((s) => s.toLowerCase());
  const cases =
    filters.length > 0
      ? BRAIN_EVAL_CASES.filter((c) => filters.some((f) => c.id.toLowerCase().includes(f)))
      : BRAIN_EVAL_CASES;

  if (cases.length === 0) {
    console.error(`No cases match filter(s): ${filters.join(", ")}`);
    process.exit(1);
  }

  console.log(
    `\nBrain eval — ${cases.length} case(s), model=${process.env.CLAUDE_MODEL ?? "claude-haiku-4-5-20251001 (default)"}\n` +
      `(each case = one live API call — this costs money)\n`
  );

  const results = await mapLimit(cases, CONCURRENCY, runOne);
  console.log("\n");

  // ---- Overall ----
  const intentCorrect = results.filter((r) => r.intentOk).length;
  const fullPass = results.filter((r) => r.pass).length;
  const errors = results.filter((r) => r.error);

  // ---- Per-intent ----
  const perIntent = new Map<string, { total: number; ok: number }>();
  for (const r of results) {
    const key = r.c.expect.intent;
    const e = perIntent.get(key) ?? { total: 0, ok: 0 };
    e.total++;
    if (r.intentOk) e.ok++;
    perIntent.set(key, e);
  }

  // ---- Field-level ----
  const fieldStats = new Map<string, { total: number; ok: number }>();
  for (const r of results) {
    for (const f of r.fields) {
      if (f.soft) continue;
      const s = fieldStats.get(f.name) ?? { total: 0, ok: 0 };
      s.total++;
      if (f.ok) s.ok++;
      fieldStats.set(f.name, s);
    }
  }

  console.log("════════════════════ RESULTS ════════════════════");
  console.log(`Intent accuracy:  ${intentCorrect}/${results.length}  (${pct(intentCorrect, results.length)})`);
  console.log(`Full pass (intent + all hard fields):  ${fullPass}/${results.length}  (${pct(fullPass, results.length)})`);
  if (errors.length) console.log(`API errors:  ${errors.length}`);

  console.log("\n── Per-intent ──");
  for (const [intent, s] of [...perIntent.entries()].sort()) {
    console.log(`  ${intent.padEnd(20)} ${s.ok}/${s.total}  (${pct(s.ok, s.total)})`);
  }

  console.log("\n── Field accuracy (hard checks) ──");
  for (const [name, s] of [...fieldStats.entries()].sort()) {
    console.log(`  ${name.padEnd(20)} ${s.ok}/${s.total}  (${pct(s.ok, s.total)})`);
  }

  // ---- Miss table ----
  const misses = results.filter((r) => !r.pass);
  if (misses.length) {
    console.log(`\n── Misses (${misses.length}) ──`);
    for (const r of misses) {
      const head = r.intentOk ? "intent OK" : `intent: want ${r.c.expect.intent}, got ${r.gotIntent}`;
      console.log(`\n  ✖ [${r.c.id}] "${r.c.message}"`);
      console.log(`      ${head}`);
      if (r.error) console.log(`      ERROR: ${r.error}`);
      for (const f of r.fields.filter((x) => !x.ok)) {
        const tag = f.soft ? "(soft) " : "";
        console.log(`      ${tag}${f.name}: want ${JSON.stringify(f.expected)}, got ${JSON.stringify(f.got)}`);
      }
    }
  } else {
    console.log("\n✅ All cases passed.");
  }
  console.log("\n══════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
