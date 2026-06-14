import { z } from "zod";
import { getAnthropicClient } from "./client";
import { getEnv } from "../env";

// ── Zod schema for the vision tool output ────────────────────────────────────

const ReceiptExtractSchema = z.object({
  found: z.boolean(),
  amountUzs: z.number().int().nullable(),
  category: z.string().nullable(),
  note: z.string().nullable(),
});

type ReceiptExtract = z.infer<typeof ReceiptExtractSchema>;

// ── Tool definition (forced tool_choice) ─────────────────────────────────────

const RECEIPT_TOOL = {
  name: "extract_receipt",
  description:
    "Extract the grand total and category from a receipt or check image.",
  input_schema: {
    type: "object" as const,
    required: ["found", "amountUzs", "category", "note"] as string[],
    properties: {
      found: {
        type: "boolean",
        description:
          "true if a clear grand total amount was found on the receipt, false otherwise.",
      },
      amountUzs: {
        type: ["integer", "null"],
        description:
          "The GRAND TOTAL of the receipt in Uzbek so'm (integer). If the receipt is in another currency, convert at approximate current rates. If no total is found, return null.",
      },
      category: {
        type: ["string", "null"],
        description:
          "The most appropriate expense category from the user's list, using the bookkeeper rule. Return null if the receipt category is completely unclear.",
      },
      note: {
        type: ["string", "null"],
        description:
          "Short note: merchant name or brief description (1-5 words). Null if not determinable.",
      },
    },
  },
} as const;

// ── Public API ────────────────────────────────────────────────────────────────

export interface ExtractReceiptOptions {
  categoryNames: string[];
  lang: string;
}

/**
 * Calls Claude with vision to extract the grand total, category, and note
 * from a receipt image encoded as base64.
 *
 * Never throws — on any error returns { found: false, ... }.
 */
export async function extractReceipt(
  imageBase64: string,
  mediaType: string,
  opts: ExtractReceiptOptions
): Promise<ReceiptExtract> {
  const fallback: ReceiptExtract = {
    found: false,
    amountUzs: null,
    category: null,
    note: null,
  };

  try {
    const env = getEnv();
    const client = getAnthropicClient();

    const catList =
      opts.categoryNames.length > 0
        ? `Known expense categories for this user:\n${opts.categoryNames.map((c) => `  • ${c}`).join("\n")}\nPick the closest match. Use the bookkeeper rule:\n- food/lavash/lunch/еда → oziq-ovqat\n- fuel/taxi/transport/бензин/такси → transport\n- medicine/pharmacy/apteka → sog'liq\n- utility/electricity/water/internet → kommunal\n- rent/arenda/ijara → ijara\n- goods/product/zakup → mahsulot\n- delivery/courier/доставка → logistika\nIf none fit, set category=null.`
        : "No existing categories. Infer a short Uzbek bookkeeper category from the receipt type (e.g. oziq-ovqat, transport, xizmat).";

    const instruction = `You are a bookkeeper reading a receipt photo. Extract the GRAND TOTAL and expense category.

${catList}

Rules:
- amountUzs must be the GRAND TOTAL (bottom line), not a line item.
- If receipt is in USD/EUR/RUB, convert to so'm at approximate rates (1 USD ≈ 12800 UZS, 1 EUR ≈ 14000 UZS, 1 RUB ≈ 142 UZS) and return the UZS integer.
- If the image is not a receipt or no total is readable, return found=false, amountUzs=null.
- note: merchant name or very short description (max 5 words). Null if unclear.
- Always call the extract_receipt tool. Never reply in plain text.`;

    const response = await client.messages.create({
      model: env.CLAUDE_MODEL,
      max_tokens: 512,
      tools: [RECEIPT_TOOL],
      tool_choice: { type: "tool", name: "extract_receipt" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType as
                  | "image/jpeg"
                  | "image/png"
                  | "image/gif"
                  | "image/webp",
                data: imageBase64,
              },
            },
            { type: "text", text: instruction },
          ],
        },
      ],
    });

    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return fallback;
    }

    const parsed = ReceiptExtractSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      console.error("Receipt schema validation failed:", parsed.error.format());
      return fallback;
    }

    return parsed.data;
  } catch (err) {
    console.error("extractReceipt error:", err);
    return fallback;
  }
}
