import type { User, PendingAction } from "@prisma/client";
import { getAnthropicClient } from "./client";
import { RECORD_INTENT_TOOL, RecordIntentSchema, type RecordIntent } from "./tools";
import { buildSystemPrompt } from "./prompts";
import { parseAmountUzs } from "./amount";
import { getEnv } from "../env";
import { getRates } from "../rates";
import { convertToUzs } from "../currency";

// Asia/Tashkent = UTC+5, no DST
function getTashkentDateString(): string {
  const now = new Date();
  const tashkent = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  return tashkent.toISOString().slice(0, 10);
}

export interface BrainInput {
  text: string;
  user: Pick<User, "id" | "language">;
  pending?: PendingAction | null;
  categoryNames?: string[];
}

export interface BrainResult {
  intent: RecordIntent;
  raw: unknown;
}

export async function runBrain(input: BrainInput): Promise<BrainResult> {
  const env = getEnv();
  const client = getAnthropicClient();

  const todayStr = getTashkentDateString();
  const categories = input.categoryNames ?? [];

  const systemPrompt = buildSystemPrompt(todayStr, categories, input.user.language);

  // Inject pending context only when waiting for a user answer (clarify_needed).
  // Do NOT inject for intent:"logged" — it carries an empty question and would
  // prepend useless context ("user was asked: ''") into every following message.
  // The lastTransactionId from a "logged" pending is still accessible via getPendingAction()
  // in bot.ts (correct_transaction / delete_transaction handlers) — not needed here.
  let userMessage = input.text;
  if (input.pending && input.pending.intent === "clarify_needed") {
    userMessage = `[Context: user was previously asked: "${input.pending.question}" — they are now answering it]\n${input.text}`;
  }

  const response = await client.messages.create({
    model: env.CLAUDE_MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    tools: [RECORD_INTENT_TOOL],
    tool_choice: { type: "tool", name: "record_intent" },
    messages: [{ role: "user", content: userMessage }],
  });

  // Find the tool use block
  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    const userLang = (input.user.language as "uz" | "ru" | "en") ?? "uz";
    const unknownReply =
      userLang === "ru"
        ? "Извините, не понял."
        : userLang === "en"
        ? "Sorry, I didn't understand."
        : "Kechirasiz, tushunmadim.";
    // Fallback: return unknown intent
    return {
      intent: {
        intent: "unknown",
        language: userLang,
        confidence: 0,
        currency: "UZS" as const,
        reply_text: unknownReply,
        missing_fields: [],
      },
      raw: response.content,
    };
  }

  // Validate with zod
  const parsed = RecordIntentSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    console.error("Brain schema validation failed:", parsed.error.format());
    const userLang2 = (input.user.language as "uz" | "ru" | "en") ?? "uz";

    // Before giving up with clarify_needed, try to recover an amount from raw text.
    // If a clear UZS amount is found, return a log_income/log_expense directly so
    // the user avoids an unnecessary extra round-trip.
    const fallbackAmount = parseAmountUzs(input.text);
    if (fallbackAmount !== null) {
      // Heuristic direction detection: income keywords win, else default to expense.
      const INCOME_RE =
        /\b(kirim|tushum|sotuv|daromat|received?|получил|доход|tushu[md]|oldi[nm]|topdi[nm])\b/i;
      const isIncome = INCOME_RE.test(input.text);
      const recoveredIntent = isIncome ? "log_income" : "log_expense";
      const recoveredReply =
        userLang2 === "ru"
          ? `Записано: ${fallbackAmount.toLocaleString()} сум.`
          : userLang2 === "en"
          ? `Logged: ${fallbackAmount.toLocaleString()} UZS.`
          : `Yozildi: ${fallbackAmount.toLocaleString()} so'm.`;
      return {
        intent: {
          intent: recoveredIntent,
          language: userLang2,
          confidence: 0.6,
          currency: "UZS" as const,
          amount: Number(fallbackAmount),
          reply_text: recoveredReply,
          missing_fields: [],
        },
        raw: toolUse.input,
      };
    }

    const clarifyReply =
      userLang2 === "ru"
        ? "Пожалуйста, напишите точнее."
        : userLang2 === "en"
        ? "Please write more clearly."
        : "Iltimos, qaytadan aniqroq yozing.";
    return {
      intent: {
        intent: "clarify_needed",
        language: userLang2,
        confidence: 0.3,
        currency: "UZS" as const,
        reply_text: clarifyReply,
        missing_fields: [],
      },
      raw: toolUse.input,
    };
  }

  const intent = parsed.data;

  // Amount fallback: if model returned null but text has parseable UZS amount
  if (
    (intent.intent === "log_income" || intent.intent === "log_expense" || intent.intent === "log_debt") &&
    (intent.amount === null || intent.amount === undefined)
  ) {
    const detectedCurrency = intent.currency ?? "UZS";
    if (detectedCurrency === "UZS") {
      // Only run UZS text fallback for UZS amounts
      const fallbackAmount = parseAmountUzs(input.text);
      if (fallbackAmount !== null) {
        intent.amount = Number(fallbackAmount);
      }
    }
    // For foreign currencies: let the amount be null → bot will ask "how much?"
  }

  // Foreign-currency conversion: if intent has a foreign currency amount, convert to UZS.
  // This means "100 dollar" becomes amountUzs = 100 * rate, stored as UZS in DB.
  const detectedCurrency = intent.currency ?? "UZS";
  if (
    (intent.intent === "log_income" || intent.intent === "log_expense" || intent.intent === "log_debt") &&
    detectedCurrency !== "UZS" &&
    intent.amount != null &&
    intent.amount > 0
  ) {
    try {
      const rates = await getRates();
      const uzs = convertToUzs(intent.amount, detectedCurrency, rates);
      // Keep original amount for the bot confirmation; store converted in a special field
      (intent as Record<string, unknown>)._originalAmount = intent.amount;
      (intent as Record<string, unknown>)._originalCurrency = detectedCurrency;
      intent.amount = Number(uzs);
    } catch {
      // If conversion fails, leave amount as-is (will be treated as raw UZS)
    }
  }

  return { intent, raw: toolUse.input };
}
