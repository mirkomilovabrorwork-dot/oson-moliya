/**
 * Brain schema (Zod) contract tests.
 * Validates that the RecordIntentSchema correctly accepts/rejects sample
 * inputs for all Phase 2 intents. No Anthropic client calls are made.
 */

import { describe, it, expect } from "vitest";
import { RecordIntentSchema } from "@/lib/claude/tools";

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseOk(input: unknown) {
  const result = RecordIntentSchema.safeParse(input);
  expect(result.success, `Expected OK but got error: ${!result.success ? JSON.stringify((result as { error: unknown }).error) : ""}`).toBe(true);
  return result.success ? result.data : null;
}

function parseFail(input: unknown) {
  const result = RecordIntentSchema.safeParse(input);
  expect(result.success, "Expected failure but schema accepted it").toBe(false);
}

// ── finance_query ─────────────────────────────────────────────────────────────

describe("RecordIntentSchema — finance_query", () => {
  it("accepts a valid sum query", () => {
    const data = parseOk({
      intent: "finance_query",
      language: "uz",
      confidence: 0.9,
      reply_text: "Hisoblanmoqda...",
      missing_fields: [],
      query: {
        metric: "sum",
        type: "expense",
        period: "this_month",
      },
    });
    expect(data?.intent).toBe("finance_query");
    expect(data?.query?.metric).toBe("sum");
  });

  it("accepts a report query", () => {
    const data = parseOk({
      intent: "finance_query",
      language: "ru",
      confidence: 0.95,
      reply_text: "Считаю...",
      missing_fields: [],
      query: {
        metric: "report",
        period: "this_month",
      },
    });
    expect(data?.query?.metric).toBe("report");
  });

  it("accepts a breakdown query with groupBy", () => {
    const data = parseOk({
      intent: "finance_query",
      language: "en",
      confidence: 0.88,
      reply_text: "Computing...",
      missing_fields: [],
      query: {
        metric: "breakdown",
        type: "expense",
        period: "last_month",
        groupBy: "category",
      },
    });
    expect(data?.query?.groupBy).toBe("category");
  });

  it("accepts net query without type", () => {
    const data = parseOk({
      intent: "finance_query",
      language: "uz",
      confidence: 0.8,
      reply_text: "...",
      missing_fields: [],
      query: {
        metric: "net",
        period: "this_week",
      },
    });
    expect(data?.query?.metric).toBe("net");
  });

  it("accepts custom period with dateFrom/dateTo", () => {
    const data = parseOk({
      intent: "finance_query",
      language: "uz",
      confidence: 0.7,
      reply_text: "...",
      missing_fields: [],
      query: {
        metric: "sum",
        period: "custom",
        dateFrom: "2025-01-01",
        dateTo: "2025-03-31",
      },
    });
    expect(data?.query?.period).toBe("custom");
    expect(data?.query?.dateFrom).toBe("2025-01-01");
  });

  it("rejects unknown metric", () => {
    parseFail({
      intent: "finance_query",
      language: "uz",
      confidence: 0.9,
      reply_text: "...",
      missing_fields: [],
      query: {
        metric: "invalid",
        period: "this_month",
      },
    });
  });

  it("rejects unknown period", () => {
    parseFail({
      intent: "finance_query",
      language: "uz",
      confidence: 0.9,
      reply_text: "...",
      missing_fields: [],
      query: {
        metric: "sum",
        period: "last_year",
      },
    });
  });
});

// ── correct_transaction ───────────────────────────────────────────────────────

describe("RecordIntentSchema — correct_transaction", () => {
  it("accepts a patch with amount", () => {
    const data = parseOk({
      intent: "correct_transaction",
      language: "uz",
      confidence: 0.9,
      reply_text: "Tuzatildi",
      missing_fields: [],
      target: "last",
      patch: {
        amount: 300000,
        category: "logistika",
      },
    });
    expect(data?.intent).toBe("correct_transaction");
    expect(data?.patch?.amount).toBe(300000);
  });

  it("accepts a patch with type change", () => {
    const data = parseOk({
      intent: "correct_transaction",
      language: "en",
      confidence: 0.85,
      reply_text: "Updated",
      missing_fields: [],
      target: "last",
      patch: {
        type: "expense",
      },
    });
    expect(data?.patch?.type).toBe("expense");
  });

  it("rejects invalid type in patch", () => {
    parseFail({
      intent: "correct_transaction",
      language: "uz",
      confidence: 0.9,
      reply_text: "...",
      missing_fields: [],
      patch: {
        type: "asset", // invalid
      },
    });
  });

  // ── New fields: target / targetAmount / targetHint ────────────────────────

  it("accepts target='by_amount' with targetAmount and targetHint", () => {
    const data = parseOk({
      intent: "correct_transaction",
      language: "uz",
      confidence: 0.92,
      reply_text: "50 000 tushlikni tuzataman",
      missing_fields: [],
      target: "by_amount",
      targetAmount: 50000,
      targetHint: "tushlik",
      patch: {
        amount: 55000,
      },
    });
    expect(data?.target).toBe("by_amount");
    expect(data?.targetAmount).toBe(50000);
    expect(data?.targetHint).toBe("tushlik");
  });

  it("accepts target='last' with no targetAmount or targetHint", () => {
    const data = parseOk({
      intent: "correct_transaction",
      language: "ru",
      confidence: 0.88,
      reply_text: "Исправляю последнюю",
      missing_fields: [],
      target: "last",
      patch: {
        category: "транспорт",
      },
    });
    expect(data?.target).toBe("last");
    expect(data?.targetAmount).toBeUndefined();
    expect(data?.targetHint).toBeUndefined();
  });

  it("accepts targetAmount as null (optional/nullable)", () => {
    const data = parseOk({
      intent: "correct_transaction",
      language: "en",
      confidence: 0.8,
      reply_text: "Fixed",
      missing_fields: [],
      target: "by_amount",
      targetAmount: null,
      targetHint: "transport",
      patch: {
        note: "fixed note",
      },
    });
    expect(data?.targetAmount).toBeNull();
    expect(data?.targetHint).toBe("transport");
  });
});

// ── delete_transaction ────────────────────────────────────────────────────────

describe("RecordIntentSchema — delete_transaction", () => {
  it("accepts delete with target=last", () => {
    const data = parseOk({
      intent: "delete_transaction",
      language: "uz",
      confidence: 0.95,
      reply_text: "O'chirildi",
      missing_fields: [],
      target: "last",
    });
    expect(data?.intent).toBe("delete_transaction");
    expect(data?.target).toBe("last");
  });

  it("rejects invalid target", () => {
    parseFail({
      intent: "delete_transaction",
      language: "uz",
      confidence: 0.9,
      reply_text: "...",
      missing_fields: [],
      target: "all", // not in enum
    });
  });
});

// ── add_category ──────────────────────────────────────────────────────────────

describe("RecordIntentSchema — add_category", () => {
  it("accepts add_category with category name and type", () => {
    const data = parseOk({
      intent: "add_category",
      language: "uz",
      confidence: 0.9,
      reply_text: "Qo'shildi",
      missing_fields: [],
      category: "ta'lim",
      type: "expense",
    });
    expect(data?.intent).toBe("add_category");
    expect(data?.category).toBe("ta'lim");
    expect(data?.type).toBe("expense");
  });

  it("accepts add_category with income type", () => {
    const data = parseOk({
      intent: "add_category",
      language: "ru",
      confidence: 0.85,
      reply_text: "Добавлено",
      missing_fields: [],
      category: "аренда недвижимости",
      type: "income",
    });
    expect(data?.type).toBe("income");
  });
});

// ── clarify_needed ────────────────────────────────────────────────────────────

describe("RecordIntentSchema — clarify_needed", () => {
  it("accepts clarify with missing_fields", () => {
    const data = parseOk({
      intent: "clarify_needed",
      language: "uz",
      confidence: 0.6,
      reply_text: "Qancha so'm?",
      missing_fields: ["amount"],
    });
    expect(data?.intent).toBe("clarify_needed");
    expect(data?.missing_fields).toContain("amount");
  });

  it("defaults missing_fields to empty array if omitted", () => {
    const data = parseOk({
      intent: "clarify_needed",
      language: "uz",
      confidence: 0.6,
      reply_text: "Aniqlashtiring.",
      // missing_fields omitted
    });
    expect(data?.missing_fields).toEqual([]);
  });
});

// ── log_income / log_expense ──────────────────────────────────────────────────

describe("RecordIntentSchema — log_income / log_expense", () => {
  it("accepts log_income with all fields", () => {
    const data = parseOk({
      intent: "log_income",
      language: "uz",
      confidence: 0.98,
      reply_text: "Yozildi: 500 000 so'm kirim, sotuv, bugun.",
      missing_fields: [],
      amount: 500000,
      type: "income",
      category: "sotuv",
      date: "today",
    });
    expect(data?.amount).toBe(500000);
  });

  it("accepts log_expense with null category", () => {
    const data = parseOk({
      intent: "log_expense",
      language: "ru",
      confidence: 0.95,
      reply_text: "Записано.",
      missing_fields: [],
      amount: 150000,
      type: "expense",
      category: null,
      date: "yesterday",
    });
    expect(data?.category).toBeNull();
  });

  it("rejects unknown intent", () => {
    parseFail({
      intent: "transfer",
      language: "uz",
      confidence: 0.9,
      reply_text: "...",
      missing_fields: [],
    });
  });
});
