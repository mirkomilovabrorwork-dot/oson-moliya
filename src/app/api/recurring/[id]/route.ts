import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { updateRule, deleteRule, pauseRule, resumeRule } from "@/lib/services/recurring";
import { db } from "@/lib/db";
import { serializeBigInt } from "@/lib/serialize";
import { assertSameOrigin } from "@/lib/http/origin";
import { z } from "zod";
import { TxType, RecurringFrequency } from "@prisma/client";

export const dynamic = "force-dynamic";

const PatchRuleSchema = z.object({
  type: z.nativeEnum(TxType).optional(),
  categoryId: z.string().nullable().optional(),
  amountUzs: z.preprocess(
    (v) => v == null ? undefined : (typeof v === "string" ? v.replace(/\s/g, "") : String(v)),
    z.string().regex(/^[1-9]\d*$/).transform((v) => BigInt(v)).optional()
  ),
  originalCurrency: z.string().nullable().optional(),
  originalAmount: z.preprocess(
    (v) => v == null ? null : (typeof v === "string" ? v.replace(/\s/g, "") : String(v)),
    z.string().regex(/^[1-9]\d*$/).transform((v) => BigInt(v)).nullable().optional()
  ),
  note: z.string().max(500).nullable().optional(),
  frequency: z.nativeEnum(RecurringFrequency).optional(),
  dayOfMonth: z.number().int().min(1).max(28).optional(),
  monthOfYear: z.number().int().min(1).max(12).nullable().optional(),
  startDate: z.string().refine((v) => !isNaN(Date.parse(v))).optional(),
  endDate: z.string().refine((v) => !isNaN(Date.parse(v))).nullable().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const prisma = db as import("@prisma/client").PrismaClient;
  const rule = await prisma.recurringRule.findFirst({
    where: { id, userId: user.id, deletedAt: null },
    include: { category: true },
  });
  if (!rule) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(serializeBigInt(rule));
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  if (action === "pause") {
    const rule = await pauseRule(id, user.id);
    if (!rule) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(serializeBigInt(rule));
  }
  if (action === "resume") {
    const rule = await resumeRule(id, user.id);
    if (!rule) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(serializeBigInt(rule));
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = PatchRuleSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Validation failed", details: parsed.error.format() }, { status: 422 });
  }

  const { startDate, endDate, ...rest } = parsed.data;
  const rule = await updateRule(id, user.id, {
    ...rest,
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate !== undefined ? (endDate ? new Date(endDate) : null) : undefined,
  });
  if (!rule) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(serializeBigInt(rule));
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const result = await deleteRule(id, user.id);
  if (!result) return Response.json({ error: "Not found" }, { status: 404 });
  return new Response(null, { status: 204 });
}
