/**
 * answer.ts — thin phrasing layer for the finance secretary.
 *
 * phraseAnswer() asks Haiku to turn pre-computed DB numbers into a warm
 * single-sentence reply. The number-safety guarantee is enforced by
 * containsAllNumbers(): if any number goes missing the function returns null
 * and the caller falls back to a deterministic template.
 */

import { getAnthropicClient } from "./client";
import { getEnv } from "../env";

// ── Pure helper ────────────────────────────────────────────────────────────────

/**
 * Normalize whitespace in a string: collapse every run of whitespace
 * characters (including NBSP, thin-space, etc.) to a single regular space.
 */
function normalizeSpaces(s: string): string {
  // \s covers regular spaces;   is NBSP;   narrow-NBSP; etc.
  return s.replace(/[\s      ]+/g, " ").trim();
}

/**
 * Returns true only if every element of `numbers` appears as a substring of
 * `text` after normalizing whitespace on both sides.
 * Empty array → true (vacuously).
 */
export function containsAllNumbers(text: string, numbers: string[]): boolean {
  if (numbers.length === 0) return true;
  const normText = normalizeSpaces(text);
  return numbers.every((n) => normText.includes(normalizeSpaces(n)));
}

// ── Static system prefix (cached on the Anthropic edge) ───────────────────────

const STATIC_SYSTEM =
  "You are a warm, concise finance assistant for a Telegram bot. " +
  "Reply in the user's language in ONE short friendly sentence. " +
  "You are GIVEN exact figures — use them VERBATIM, never invent or change a number, " +
  "never add figures that aren't provided.";

// ── phraseAnswer ───────────────────────────────────────────────────────────────

export interface PhraseAnswerInput {
  question: string;
  lang: "uz" | "ru" | "en";
  headline: string;
  numbers: string[];
  detail?: string;
}

/**
 * Calls the Anthropic model to produce a natural-language phrasing of a
 * pre-computed finance answer.
 *
 * Returns the model's trimmed output if it passes the number-safety check.
 * Returns null if the check fails, the API throws, or the call times out.
 * NEVER throws.
 */
export async function phraseAnswer(input: PhraseAnswerInput): Promise<string | null> {
  const TIMEOUT_MS = 6000;

  try {
    const env = getEnv();
    const client = getAnthropicClient();

    const userMessage = [
      `Language: ${input.lang}`,
      `User question: ${input.question}`,
      `Computed headline: ${input.headline}`,
      `Exact numbers (use VERBATIM): ${input.numbers.join(", ")}`,
      ...(input.detail ? [`Additional detail: ${input.detail}`] : []),
    ].join("\n");

    const responsePromise = client.messages.create({
      model: env.CLAUDE_MODEL,
      max_tokens: 120,
      system: [
        {
          type: "text",
          text: STATIC_SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userMessage }],
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("phraseAnswer timeout")), TIMEOUT_MS)
    );

    const response = await Promise.race([responsePromise, timeoutPromise]);

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;

    const output = textBlock.text.trim();
    if (!containsAllNumbers(output, input.numbers)) return null;

    return output;
  } catch {
    return null;
  }
}
