import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { listActiveRules, createRule } from "@/lib/services/recurring";
import { serializeBigInt } from "@/lib/serialize";
import { assertSameOrigin } from "@/lib/http/origin";
import { z } from "zod";
import { TxType, RecurringFrequency } from "@prisma/client";

export const dynamic = "force-dynamic";

const CreateRuleSchema = z.object({
  type: z.nativeEnum(TxType),
  categoryId: z.string().nullable().optional(),
  amountUzs: z.preprocess(
    (v) => (typeof v === "string" ? v.replace(/\s/g, "") : String(v)),
    z.string().regex(/^[1-9]\d*$/).transform((v) => BigInt(v))
  ),
  originalCurrency: z.string().nullable().optional(),
  originalAmount: z.preprocess(
    (v) => v == null ? null : (typeof v === "string" ? v.replace(/\s/g, "") : String(v)),
    z.string().regex(/^[1-9]\d*$/).transform((v) => BigInt(v)).nullable().optional()
  ),
  note: z.string().max(500).nullable().optional(),
  frequency: z.nativeEnum(RecurringFrequency),
  dayOfMonth: z.number().int().min(1).max(28),
  monthOfYear: z.number().int().min(1).max(12).nullable().optional(),
  startDate: z.string().refine((v) => !isNaN(Date.parse(v))),
  endDate: z.string().refine((v) => !isNaN(Date.parse(v))).nullable().optional(),
});

export async function GET(request: NextRequest): Promise<Response> {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const rules = await listActiveRules(user.id);
  return Response.json(serializeBigInt(rules));
}

export async function POST(request: NextRequest): Promise<Response> {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreateRuleSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Validation failed", details: parsed.error.format() }, { status: 422 });
  }

  // Fix D: category is required for new rules
  if (!parsed.data.categoryId) {
    return Response.json({ error: "categoryId is required" }, { status: 400 });
  }

  const { startDate, endDate, ...rest } = parsed.data;
  try {
    const rule = await createRule({
      userId: user.id,
      ...rest,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
    });
    return Response.json(serializeBigInt(rule), { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "DAY_OUT_OF_RANGE") return Response.json({ error: "Day must be 1-28" }, { status: 422 });
    if (msg === "MONTH_REQUIRED_FOR_YEARLY") return Response.json({ error: "monthOfYear required for yearly" }, { status: 422 });
    if (msg === "CATEGORY_REQUIRED") return Response.json({ error: "categoryId is required" }, { status: 400 });
    if (msg === "CATEGORY_NOT_FOUND") return Response.json({ error: "Category not found or not owned by user" }, { status: 400 });
    if (msg === "CATEGORY_TYPE_MISMATCH") return Response.json({ error: "Category type does not match rule type" }, { status: 400 });
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
