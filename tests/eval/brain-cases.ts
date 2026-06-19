/**
 * Brain accuracy eval — labeled test cases.
 *
 * These are REAL-WORLD Uzbek/Russian/English messages a user might send to the
 * Oson Moliya bot, paired with the result we EXPECT runBrain() to produce.
 *
 * This file is NOT a vitest test (vitest only globs `tests/ ** / *.test.ts`).
 * It is consumed by `scripts/eval-brain.ts` (`npm run eval`), which calls the
 * REAL Claude API and measures classification accuracy. Running it costs a few
 * cents per run, so it is NOT part of the default gate/CI — it is the safety net
 * we run by hand before shipping any brain or cost change.
 *
 * Grow this set over time with the user's real live-test messages (target ~100).
 *
 * Field semantics for `expect` (every field is OPTIONAL except `intent` — the
 * harness only checks the fields that are present):
 *   intent        — REQUIRED. The core classification.
 *   type          — income | expense (for log_income/log_expense).
 *   amount        — expected whole UZS amount AFTER expansion. Only assert for
 *                   UZS cases; for foreign currency use `originalAmount` instead
 *                   (runBrain converts foreign → UZS via LIVE rates = non-deterministic).
 *   currency      — UZS | USD | EUR | RUB.
 *   originalAmount — the pre-conversion amount for a foreign-currency case.
 *   direction     — given | taken (debt_direction).
 *   counterparty  — substring expected (lowercased) in the counterparty field.
 *   category      — substring expected (lowercased) in the category field (SOFT —
 *                   reported but does not fail the case on its own; categories
 *                   legitimately vary).
 *   metric/period — for finance_query.
 *   accountName   — for account_query (null = total/all).
 *   target/targetAmount/targetHint — for correct/delete_transaction.
 *   itemsCount    — number of items expected for log_multiple.
 */

import type { RecordIntent } from "../../src/lib/claude/tools";

/** A representative default category list, passed to the brain so reuse-matching
 *  (prefer an existing category over creating a near-duplicate) is exercised. */
export const DEFAULT_CATEGORIES = [
  "oziq-ovqat",
  "transport",
  "oylik",
  "kommunal",
  "ijara",
  "soliq",
  "marketing",
  "mahsulot",
  "logistika",
  "xizmat",
];

export interface BrainEvalCase {
  id: string;
  message: string;
  /** Interface language (reply language). Default "uz". */
  lang?: "uz" | "ru" | "en";
  expect: {
    intent: RecordIntent["intent"];
    type?: "income" | "expense";
    amount?: number;
    currency?: "UZS" | "USD" | "EUR" | "RUB";
    originalAmount?: number;
    direction?: "given" | "taken";
    counterparty?: string;
    category?: string;
    metric?: "sum" | "count" | "avg" | "net" | "breakdown" | "report" | "top";
    period?:
      | "today"
      | "yesterday"
      | "this_week"
      | "this_month"
      | "last_month"
      | "this_year"
      | "custom";
    compareToPrevious?: boolean;
    accountName?: string | null;
    target?: "last" | "by_amount";
    targetAmount?: number;
    targetHint?: string;
    itemsCount?: number;
  };
  /** Why this case matters / what edge it probes. */
  note?: string;
}

export const BRAIN_EVAL_CASES: BrainEvalCase[] = [
  // ---- log_expense (the most common intent) ----
  {
    id: "exp-lavash",
    message: "lavash oldim 25 ming",
    expect: { intent: "log_expense", type: "expense", amount: 25000, category: "oziq-ovqat" },
    note: "Clear food expense + ming shorthand.",
  },
  {
    id: "exp-taksi",
    message: "taksi 15000",
    expect: { intent: "log_expense", type: "expense", amount: 15000, category: "transport" },
  },
  {
    id: "exp-svet",
    message: "svetga 80 ming to'ladim",
    expect: { intent: "log_expense", type: "expense", amount: 80000, category: "kommunal" },
    note: "Utility payment → kommunal; 'to'ladim' = paid = expense.",
  },
  {
    id: "exp-ijara",
    message: "ofis ijarasi 3 mln",
    expect: { intent: "log_expense", type: "expense", amount: 3000000, category: "ijara" },
  },
  {
    id: "exp-soldim",
    message: "telefonga 20 ming soldim",
    expect: { intent: "log_expense", type: "expense", amount: 20000 },
    note: "'soldim' = topped up = EXPENSE, not income.",
  },

  // ---- log_income ----
  {
    id: "inc-sotuv",
    message: "500 ming sotuv",
    expect: { intent: "log_income", type: "income", amount: 500000 },
    note: "Sale = clear income signal.",
  },
  {
    id: "inc-oylik",
    message: "oylik oldim 4 million",
    expect: { intent: "log_income", type: "income", amount: 4000000, category: "oylik" },
  },
  {
    id: "inc-mijoz",
    message: "mijoz 1,2 mln to'ladi",
    expect: { intent: "log_income", type: "income", amount: 1200000 },
    note: "Client paid ME = income; comma-decimal mln.",
  },
  {
    id: "inc-menga-berdi",
    message: "menga 300 ming berishdi xizmat uchun",
    expect: { intent: "log_income", type: "income", amount: 300000 },
    note: "'menga berishdi' = paid to me = income.",
  },

  // ---- log_debt ----
  {
    id: "debt-given",
    message: "Jamshitga 500 ming qarz berdim",
    expect: { intent: "log_debt", direction: "given", counterparty: "jamshit", amount: 500000 },
  },
  {
    id: "debt-taken",
    message: "Sardordan 1 million qarz oldim",
    expect: { intent: "log_debt", direction: "taken", counterparty: "sardor", amount: 1000000 },
  },
  {
    id: "debt-given-noqarzword",
    message: "Akmalga 200 ming berib turdim",
    expect: { intent: "log_debt", direction: "given", counterparty: "akmal", amount: 200000 },
    note: "'berib turdim' = lent (no literal 'qarz' word).",
  },

  // ---- repay_debt ----
  {
    id: "repay-other-returned",
    message: "Akmal 300 ming qaytardi",
    expect: { intent: "repay_debt", direction: "given", counterparty: "akmal", amount: 300000 },
    note: "Other person returns to me → pays down money I LENT (given).",
  },
  {
    id: "repay-i-paid",
    message: "Bahodirga qarzimni to'ladim 200 ming",
    expect: { intent: "repay_debt", direction: "taken", counterparty: "bahodir", amount: 200000 },
    note: "I pay the other person back → pays down money I BORROWED (taken).",
  },
  {
    id: "repay-all",
    message: "Sarvarga hammasini qaytardim",
    expect: { intent: "repay_debt", direction: "taken", counterparty: "sarvar" },
    note: "repay_all = true; amount may be null.",
  },

  // ---- log_multiple ----
  {
    id: "multi-tx",
    message: "non 10 ming, taksi 20 ming, oylik oldim 5 million",
    expect: { intent: "log_multiple", itemsCount: 3 },
    note: "3 distinct tx in one message.",
  },
  {
    id: "multi-mixed",
    message: "non 10 ming oldim, jamshitga 50 ming qarz berdim",
    expect: { intent: "log_multiple", itemsCount: 2 },
    note: "Mixed tx + debt.",
  },
  {
    id: "multi-not-single",
    message: "lavash 10 ming oldim",
    expect: { intent: "log_expense", type: "expense", amount: 10000 },
    note: "ONE item must stay single — never log_multiple.",
  },

  // ---- finance_query ----
  {
    id: "fq-sum-expense",
    message: "bu oy qancha chiqim",
    expect: { intent: "finance_query", metric: "sum", period: "this_month" },
  },
  {
    id: "fq-report",
    message: "shu oy uchun hisobot ber",
    expect: { intent: "finance_query", metric: "report", period: "this_month" },
  },
  {
    id: "fq-net",
    message: "bu oy sof foydam qancha",
    expect: { intent: "finance_query", metric: "net", period: "this_month" },
  },
  {
    id: "fq-breakdown",
    message: "kategoriyalar bo'yicha xarajatlarimni ko'rsat",
    expect: { intent: "finance_query", metric: "breakdown" },
  },
  {
    id: "fq-top",
    message: "eng katta 5 ta xarajatim qaysi",
    expect: { intent: "finance_query", metric: "top" },
    note: "Largest individual transactions → top.",
  },
  {
    id: "fq-compare",
    message: "bu oy o'tgan oyga nisbatan qancha sarfladim",
    expect: { intent: "finance_query", compareToPrevious: true, period: "this_month" },
  },

  // ---- debt_query ----
  {
    id: "dq-general",
    message: "qarzlarim qancha",
    expect: { intent: "debt_query" },
  },
  {
    id: "dq-who-owes-me",
    message: "menga kim qarzdor",
    expect: { intent: "debt_query", direction: "given" },
  },
  {
    id: "dq-who-do-i-owe",
    message: "kimga qarzim bor",
    expect: { intent: "debt_query", direction: "taken" },
  },
  {
    id: "dq-counterparty",
    message: "Sarvar menga qancha qarzdor",
    expect: { intent: "debt_query", counterparty: "sarvar", direction: "given" },
    note: "MUST NOT be confused with repay_debt.",
  },

  // ---- account_query ----
  {
    id: "aq-total",
    message: "qancha pulim bor",
    expect: { intent: "account_query", accountName: null },
  },
  {
    id: "aq-named",
    message: "kassada qancha pul bor",
    expect: { intent: "account_query", accountName: "kassa" },
    note: "Balance/state question (not flow).",
  },

  // ---- correct / delete ----
  {
    id: "corr-last",
    message: "oxirgisini tuzat",
    expect: { intent: "correct_transaction", target: "last" },
  },
  {
    id: "corr-by-amount",
    message: "50 minglik xarajatni o'zgartir",
    expect: { intent: "correct_transaction", target: "by_amount", targetAmount: 50000 },
  },
  {
    id: "del-last",
    message: "oxirgi yozuvni o'chir",
    expect: { intent: "delete_transaction", target: "last" },
  },
  {
    id: "del-by-hint",
    message: "tushlikni o'chir",
    expect: { intent: "delete_transaction", target: "by_amount", targetHint: "tushlik" },
  },

  // ---- add_category ----
  {
    id: "addcat",
    message: "yangi kategoriya qo'sh: ehson",
    expect: { intent: "add_category" },
  },

  // ---- clarify_needed ----
  {
    id: "clarify-no-amount",
    message: "biroz pul sarfladim",
    expect: { intent: "clarify_needed" },
    note: "Expense intent but no recoverable amount.",
  },
  {
    id: "clarify-unsupported-currency",
    message: "100 funt sterling sarfladim",
    expect: { intent: "clarify_needed" },
    note: "GBP is unsupported → clarify (USD/EUR/RUB are supported).",
  },

  // ---- unknown ----
  {
    id: "unknown-greeting",
    message: "salom, qalaysiz",
    expect: { intent: "unknown" },
  },
  {
    id: "unknown-weather",
    message: "bugun ob-havo qanday",
    expect: { intent: "unknown" },
  },

  // ---- foreign currency (amount converted via live rates → assert originalAmount) ----
  {
    id: "fx-usd-expense",
    message: "100 dollar transportga ketdi",
    expect: { intent: "log_expense", type: "expense", currency: "USD", originalAmount: 100 },
  },
  {
    id: "fx-eur-income",
    message: "200 evro sotuv bo'ldi",
    expect: { intent: "log_income", type: "income", currency: "EUR", originalAmount: 200 },
  },

  // ---- noisy voice / spelled-out numbers (Uzbek STT artefacts) ----
  {
    id: "voice-qirq-ming",
    message: "qirq ming taksi",
    expect: { intent: "log_expense", type: "expense", amount: 40000, category: "transport" },
    note: "qirq=40, ming=1000 → 40000.",
  },
  {
    id: "voice-misom",
    message: "ellik misom non oldim",
    expect: { intent: "log_expense", type: "expense", amount: 50000, category: "oziq-ovqat" },
    note: "'misom' = mis-heard 'ming so'm'; ellik=50 → 50000.",
  },

  // ---- Russian ----
  {
    id: "ru-expense",
    message: "купил обед за 25000",
    lang: "ru",
    expect: { intent: "log_expense", type: "expense", amount: 25000, category: "oziq-ovqat" },
  },
  {
    id: "ru-query",
    message: "сколько я потратил в этом месяце",
    lang: "ru",
    expect: { intent: "finance_query", metric: "sum", period: "this_month" },
  },
];
