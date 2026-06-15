import { z } from "zod";

// ---- Zod schema for server-side validation of the tool output ----
export const QuerySchema = z.object({
  metric: z.enum(["sum", "count", "avg", "net", "breakdown", "report"]),
  type: z.enum(["income", "expense"]).nullable().optional(),
  category: z.string().nullable().optional(),
  period: z.enum([
    "today",
    "yesterday",
    "this_week",
    "this_month",
    "last_month",
    "this_year",
    "custom",
  ]),
  dateFrom: z.string().nullable().optional(),
  dateTo: z.string().nullable().optional(),
  groupBy: z.enum(["category", "day", "month"]).nullable().optional(),
});

export const PatchSchema = z.object({
  amount: z.number().int().positive().nullable().optional(),
  category: z.string().nullable().optional(),
  type: z.enum(["income", "expense"]).nullable().optional(),
  note: z.string().nullable().optional(),
});

export const RecordIntentSchema = z.object({
  intent: z.enum([
    "log_income",
    "log_expense",
    "log_debt",
    "finance_query",
    "correct_transaction",
    "delete_transaction",
    "add_category",
    "clarify_needed",
    "unknown",
  ]),
  language: z.enum(["uz", "ru", "en"]),
  confidence: z.number().min(0).max(1),
  amount: z.number().int().nullable().optional(),
  currency: z.enum(["UZS", "USD", "EUR", "RUB"]).default("UZS"),
  type: z.enum(["income", "expense"]).nullable().optional(),
  category: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  query: QuerySchema.nullable().optional(),
  target: z.enum(["last", "by_amount"]).nullable().optional(),
  /** Whole-number UZS amount to match when target="by_amount". */
  targetAmount: z.number().int().positive().nullable().optional(),
  /** Category or note hint to match when target="by_amount" (lowercase). */
  targetHint: z.string().nullable().optional(),
  patch: PatchSchema.nullable().optional(),
  counterparty: z.string().nullable().optional(),
  debt_direction: z.enum(["given", "taken"]).nullable().optional(),
  missing_fields: z.array(z.string()).default([]),
  reply_text: z.string(),
});

export type RecordIntent = z.infer<typeof RecordIntentSchema>;

// ---- Anthropic tool definition ----
export const RECORD_INTENT_TOOL = {
  name: "record_intent",
  description:
    "Parse a finance-related message and extract structured intent, amount, category, and other fields.",
  input_schema: {
    type: "object" as const,
    required: ["intent", "language", "confidence", "reply_text"] as string[],
    properties: {
      intent: {
        type: "string",
        enum: [
          "log_income",
          "log_expense",
          "log_debt",
          "finance_query",
          "correct_transaction",
          "delete_transaction",
          "add_category",
          "clarify_needed",
          "unknown",
        ],
        description: "The detected intent of the user's message.",
      },
      language: {
        type: "string",
        enum: ["uz", "ru", "en"],
        description: "Detected language of the user message.",
      },
      confidence: {
        type: "number",
        description: "Confidence score between 0 and 1.",
      },
      amount: {
        type: ["integer", "null"],
        description:
          "Whole amount (expanded from shorthands) in the detected currency. Null if unknown.",
      },
      currency: {
        type: "string",
        enum: ["UZS", "USD", "EUR", "RUB"],
        description:
          "Currency of the amount field. Default UZS. Set to USD/EUR/RUB when the user mentions a foreign currency.",
      },
      type: {
        type: ["string", "null"],
        enum: ["income", "expense", null],
        description: "Transaction type.",
      },
      category: {
        type: ["string", "null"],
        description: "Category name (lowercased). Null if unknown.",
      },
      date: {
        type: ["string", "null"],
        description: 'today | yesterday | YYYY-MM-DD. Null if not mentioned.',
      },
      note: {
        type: ["string", "null"],
        description: "Optional note or description.",
      },
      query: {
        type: ["object", "null"],
        description: "Finance query parameters (for finance_query intent).",
        properties: {
          metric: {
            type: "string",
            enum: ["sum", "count", "avg", "net", "breakdown", "report"],
          },
          type: { type: ["string", "null"], enum: ["income", "expense", null] },
          category: { type: ["string", "null"] },
          period: {
            type: "string",
            enum: [
              "today",
              "yesterday",
              "this_week",
              "this_month",
              "last_month",
              "this_year",
              "custom",
            ],
          },
          dateFrom: { type: ["string", "null"] },
          dateTo: { type: ["string", "null"] },
          groupBy: {
            type: ["string", "null"],
            enum: ["category", "day", "month", null],
          },
        },
        required: ["metric", "period"],
      },
      target: {
        type: ["string", "null"],
        enum: ["last", "by_amount", null],
        description:
          "Target for correct/delete operations. Use 'by_amount' when the user references a specific amount or category (e.g. 'fix the 50 000 one'). Use 'last' when the user says 'last' or 'previous' without specifying which.",
      },
      targetAmount: {
        type: ["integer", "null"],
        description:
          "When target='by_amount': the UZS amount to match (expanded, whole integer). Null if not mentioned.",
      },
      targetHint: {
        type: ["string", "null"],
        description:
          "When target='by_amount': lowercase category or note keyword to help find the transaction (e.g. 'tushlik', 'transport'). Null if not mentioned.",
      },
      patch: {
        type: ["object", "null"],
        description: "Fields to update for correct_transaction.",
        properties: {
          amount: { type: ["integer", "null"] },
          category: { type: ["string", "null"] },
          type: { type: ["string", "null"], enum: ["income", "expense", null] },
          note: { type: ["string", "null"] },
        },
      },
      counterparty: {
        type: ["string", "null"],
        description: "The OTHER person's name involved in a debt (for log_debt). Null if unknown.",
      },
      debt_direction: {
        type: ["string", "null"],
        enum: ["given", "taken", null],
        description: "'given' if the user lent money (berdim/дал/lent), 'taken' if borrowed (oldim/взял/borrowed). Null if unclear.",
      },
      missing_fields: {
        type: "array",
        items: { type: "string" },
        description: "Fields still needed (for clarify_needed intent).",
      },
      reply_text: {
        type: "string",
        description:
          "Localized reply to send back to the user (in detected language).",
      },
    },
  },
} as const;
