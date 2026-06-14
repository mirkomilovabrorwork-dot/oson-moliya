import type { User, PendingAction } from "@prisma/client";
import { getAnthropicClient } from "./client";
import { RECORD_INTENT_TOOL, RecordIntentSchema, type RecordIntent } from "./tools";
import { buildSystemPrompt } from "./prompts";
import { parseAmountUzs } from "./amount";
import { getEnv } from "../env";

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

  const systemPrompt = buildSystemPrompt(todayStr, categories);

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
    // Fallback: return unknown intent
    return {
      intent: {
        intent: "unknown",
        language: (input.user.language as "uz" | "ru" | "en") ?? "uz",
        confidence: 0,
        reply_text: "Kechirasiz, tushunmadim.",
        missing_fields: [],
      },
      raw: response.content,
    };
  }

  // Validate with zod
  const parsed = RecordIntentSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    console.error("Brain schema validation failed:", parsed.error.format());
    return {
      intent: {
        intent: "clarify_needed",
        language: (input.user.language as "uz" | "ru" | "en") ?? "uz",
        confidence: 0.3,
        reply_text: "Iltimos, qaytadan aniqroq yozing.",
        missing_fields: [],
      },
      raw: toolUse.input,
    };
  }

  const intent = parsed.data;

  // Foreign-currency guard (R10): if the text mentions a foreign currency
  // token, do NOT run the UZS amount fallback — force clarification instead.
  // This prevents "100 dollar" from being silently logged as 100 so'm.
  const FOREIGN_CURRENCY_RE =
    /dollar|do['']llar|do['']lr|\$|евро|euro|€|rubl|рубль|₽|£|¥/i;

  // Amount fallback: if model returned null but text has parseable amount
  if (
    (intent.intent === "log_income" || intent.intent === "log_expense") &&
    (intent.amount === null || intent.amount === undefined)
  ) {
    if (FOREIGN_CURRENCY_RE.test(input.text)) {
      // Foreign currency detected — skip UZS fallback, force clarification
      return {
        intent: {
          intent: "clarify_needed",
          language: (input.user.language as "uz" | "ru" | "en") ?? "uz",
          confidence: 0.5,
          reply_text:
            "Qaysi valyutada? Iltimos, so'mda miqdorni yozing (masalan: 500 ming so'm).",
          missing_fields: ["amount"],
        },
        raw: toolUse.input,
      };
    }
    const fallbackAmount = parseAmountUzs(input.text);
    if (fallbackAmount !== null) {
      intent.amount = Number(fallbackAmount);
    }
  }

  return { intent, raw: toolUse.input };
}
