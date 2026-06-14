import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { settleDebt, updateDebt, deleteDebt } from "@/lib/services/debts";
import { serializeBigInt } from "@/lib/serialize";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/http/origin";

export const dynamic = "force-dynamic";

const AmountUzsSchema = z.preprocess(
  (value) => {
    if (typeof value === "string") return value.replace(/\s/g, "");
    if (typeof value === "number" && Number.isInteger(value)) return String(value);
    return value;
  },
  z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform((value) => BigInt(value))
);

const PatchDebtSchema = z.object({
  status: z.enum(["settled"]).optional(),
  counterparty: z.string().min(1).max(200).optional(),
  amountUzs: AmountUzsSchema.optional(),
  note: z.string().max(500).nullable().optional(),
  occurredAt: z.string().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PatchDebtSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.format() },
      { status: 422 }
    );
  }

  const data = parsed.data;

  // Settle shortcut
  if (data.status === "settled") {
    const updated = await settleDebt(id, user.id);
    if (!updated) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json(serializeBigInt(updated));
  }

  // General update
  const updated = await updateDebt(id, user.id, {
    counterparty: data.counterparty,
    amountUzs: data.amountUzs,
    note: data.note,
    occurredAt: data.occurredAt ? new Date(data.occurredAt) : undefined,
  });

  if (!updated) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json(serializeBigInt(updated));
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const result = await deleteDebt(id, user.id);

  if (!result) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}
