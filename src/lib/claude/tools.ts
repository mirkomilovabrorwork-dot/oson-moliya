import { z } from "zod";

// ---- Zod schema for server-side validation of the tool output ----
export const QuerySchema = z.object({
  metric: z.enum(["sum", "count", "avg", "net", "breakdown"]),
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
  type: z.enum(["income", "expense"]).nullable().optional(),
  category: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  query: QuerySchema.nullable().optional(),
  target: z.enum(["last", "by_amount"]).nullable().optional(),
  patch: PatchSchema.nullable().optional(),
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
          "Whole so'm amount (expanded from shorthands). Null if unknown.",
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
            enum: ["sum", "count", "avg", "net", "breakdown"],
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
        description: "Target for correct/delete operations.",
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
