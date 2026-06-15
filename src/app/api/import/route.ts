/**
 * POST /api/import
 *
 * Parse a bank statement file (image / PDF / Excel / CSV) with AI and return
 * a preview list of transactions. Does NOT write to the DB — that is done by
 * POST /api/import/commit after the user reviews.
 *
 * AI cost: one Claude call per import (Haiku — cheap).
 * Accept: application/json { fileBase64: string, mimeType: string, fileName: string }
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import ExcelJS from "exceljs";
import { getSessionUser } from "@/lib/auth/session";
import { getAnthropicClient } from "@/lib/claude/client";
import { getEnv } from "@/lib/env";
import { assertSameOrigin } from "@/lib/http/origin";
import { CANONICAL_CATEGORY_DEFS } from "@/lib/categories-i18n";

export const dynamic = "force-dynamic";

// ── 10 MB base64 cap (≈ 7.5 MB raw) ─────────────────────────────────────────
const MAX_BASE64_BYTES = 14_000_000; // ~10 MB decoded

// ── Zod: one parsed transaction row ──────────────────────────────────────────
const ParsedTxSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  amountUzs: z
    .number()
    .int()
    .positive()
    .or(z.number().positive().transform(Math.round)),
  type: z.enum(["income", "expense"]),
  category: z.string().max(100),
  note: z.string().max(300),
  originalCurrency: z.string().max(10).nullable().optional(),
  originalAmount: z.number().positive().nullable().optional(),
});

export type ParsedTx = z.infer<typeof ParsedTxSchema>;

// ── Request body schema ───────────────────────────────────────────────────────
const BodySchema = z.object({
  fileBase64: z.string().max(MAX_BASE64_BYTES),
  mimeType: z.string().max(200),
  fileName: z.string().max(500),
});

// ── Helper: detect file type bucket ──────────────────────────────────────────
function detectBucket(
  mimeType: string,
  fileName: string
): "image" | "pdf" | "xlsx" | "csv" {
  const mime = mimeType.toLowerCase();
  const name = fileName.toLowerCase();

  if (
    mime.startsWith("image/") ||
    /\.(jpg|jpeg|png|webp|gif)$/.test(name)
  ) {
    return "image";
  }
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (
    mime ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    name.endsWith(".xlsx") ||
    name.endsWith(".xls")
  ) {
    return "xlsx";
  }
  return "csv";
}

// ── Helper: extract plain-text table from Excel ───────────────────────────────
async function xlsxToText(buffer: Buffer): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any);
  const lines: string[] = [];
  workbook.eachSheet((sheet) => {
    sheet.eachRow((row) => {
      const cells = (row.values as (ExcelJS.CellValue | undefined)[])
        .slice(1) // ExcelJS row.values is 1-indexed — slice off the undefined at [0]
        .map((v) => {
          if (v === null || v === undefined) return "";
          if (typeof v === "object" && "result" in v) return String(v.result ?? "");
          if (v instanceof Date) return v.toISOString().slice(0, 10);
          return String(v);
        });
      lines.push(cells.join("\t"));
    });
  });
  return lines.join("\n");
}

// ── Tool definition for structured output ────────────────────────────────────
const IMPORT_TOOL = {
  name: "extract_statement",
  description: "Extract all transactions from a bank statement.",
  input_schema: {
    type: "object" as const,
    required: ["transactions"] as string[],
    properties: {
      transactions: {
        type: "array",
        maxItems: 150,
        items: {
          type: "object",
          required: ["date", "amountUzs", "type", "category", "note"] as string[],
          properties: {
            date: {
              type: "string",
              description: "Transaction date as YYYY-MM-DD.",
            },
            amountUzs: {
              type: "integer",
              description:
                "Amount in Uzbek so'm (integer). If the statement is in another currency, convert at approximate rates: 1 USD ≈ 12800 UZS, 1 EUR ≈ 14000 UZS, 1 RUB ≈ 142 UZS. Always return positive integer.",
            },
            type: {
              type: "string",
              enum: ["income", "expense"],
              description: "income = money coming in, expense = money going out.",
            },
            category: {
              type: "string",
              description: "Best-matching category from the provided list. Use the key exactly.",
            },
            note: {
              type: "string",
              description: "Merchant name or short description (max 60 chars).",
            },
            originalCurrency: {
              type: "string",
              description: "ISO 4217 currency code if the statement is NOT in UZS (e.g. USD, EUR, RUB). Omit if UZS.",
            },
            originalAmount: {
              type: "number",
              description: "Native amount before conversion. Omit if UZS.",
            },
          },
        },
      },
    },
  },
};

// ── Build Claude instruction ──────────────────────────────────────────────────
function buildInstruction(): string {
  const catList = CANONICAL_CATEGORY_DEFS.map(
    (c) => `  • ${c.key} (${c.type}) — ${c.uz} / ${c.ru} / ${c.en}`
  ).join("\n");

  return `You are a bookkeeper reading a bank statement.
Extract every individual transaction row. Ignore header rows, subtotals, opening/closing balance rows, and any row that is not a real transaction.

Known categories (use the key exactly):
${catList}

Rules:
- If a row is an account-to-account transfer (same owner), skip it.
- If you cannot determine the date, use today's date (${new Date().toISOString().slice(0, 10)}).
- Match each row to the closest category. If unclear, use "boshqa chiqim" for expenses or "boshqa kirim" for income.
- Return at most 100 transactions.
- Always call the extract_statement tool. Never reply in plain text.`;
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function POST(request: NextRequest): Promise<Response> {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.format() },
      { status: 422 }
    );
  }

  const { fileBase64, mimeType, fileName } = parsed.data;
  const bucket = detectBucket(mimeType, fileName);
  const env = getEnv();
  const client = getAnthropicClient();
  const instruction = buildInstruction();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let messageContent: any[];

    if (bucket === "image") {
      // Vision message — image as base64 content block
      const supportedMime = ((): "image/jpeg" | "image/png" | "image/gif" | "image/webp" => {
        const m = mimeType.toLowerCase();
        if (m.includes("png")) return "image/png";
        if (m.includes("gif")) return "image/gif";
        if (m.includes("webp")) return "image/webp";
        return "image/jpeg";
      })();

      messageContent = [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: supportedMime,
            data: fileBase64,
          },
        },
        { type: "text", text: instruction },
      ];
    } else if (bucket === "pdf") {
      // PDF as document content block (Anthropic supports PDF input)
      messageContent = [
        {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: fileBase64,
          },
        },
        { type: "text", text: instruction },
      ];
    } else if (bucket === "xlsx") {
      // Read Excel → plain text → send as text
      const buffer = Buffer.from(fileBase64, "base64");
      const tableText = await xlsxToText(buffer);
      const cap = Math.min(tableText.length, 60_000);
      messageContent = [
        {
          type: "text",
          text: `${instruction}\n\nSpreadsheet content:\n${tableText.slice(0, cap)}`,
        },
      ];
    } else {
      // CSV — decode as UTF-8 text
      const csvText = Buffer.from(fileBase64, "base64").toString("utf-8");
      const cap = Math.min(csvText.length, 60_000);
      messageContent = [
        {
          type: "text",
          text: `${instruction}\n\nCSV content:\n${csvText.slice(0, cap)}`,
        },
      ];
    }

    const response = await client.messages.create({
      model: env.CLAUDE_MODEL,
      max_tokens: 8192,
      tools: [IMPORT_TOOL],
      tool_choice: { type: "tool", name: "extract_statement" },
      messages: [{ role: "user", content: messageContent }],
    });

    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return Response.json(
        { error: "parse_failed", transactions: [] },
        { status: 200 }
      );
    }

    const rawTransactions = (toolUse.input as { transactions?: unknown[] }).transactions ?? [];

    const validTransactions: ParsedTx[] = [];
    for (const row of rawTransactions) {
      const r = ParsedTxSchema.safeParse(row);
      if (r.success) validTransactions.push(r.data);
    }

    if (validTransactions.length === 0) {
      return Response.json(
        { error: "nothing_parsed", transactions: [] },
        { status: 200 }
      );
    }

    return Response.json({ transactions: validTransactions }, { status: 200 });
  } catch (err) {
    console.error("[import/parse] error:", err);
    return Response.json({ error: "generic" }, { status: 500 });
  }
}
