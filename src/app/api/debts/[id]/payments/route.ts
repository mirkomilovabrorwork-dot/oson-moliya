import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { addDebtPayment } from "@/lib/services/debts";
import { serializeBigInt } from "@/lib/serialize";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/http/origin";

export const dynamic = "force-dynamic";

const PaymentSchema = z.object({
  amountUzs: z.preprocess(
    (value) => {
      if (typeof value === "string") return value.replace(/\s/g, "");
      if (typeof value === "number" && Number.isInteger(value)) return String(value);
      return value;
    },
    z
      .string()
      .regex(/^[1-9]\d*$/)
      .transform((value) => BigInt(value))
  ),
  occurredAt: z.string().refine((v) => !isNaN(Date.parse(v)), { message: "Invalid date" }),
  note: z.string().max(500).nullable().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: debtId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PaymentSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.format() },
      { status: 422 }
    );
  }

  const { amountUzs, occurredAt, note } = parsed.data;

  try {
    const result = await addDebtPayment({
      debtId,
      userId: user.id,
      amountUzs,
      occurredAt: new Date(occurredAt),
      note: note ?? null,
    });

    if (!result) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    return Response.json(serializeBigInt(result));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "EXCEEDS_REMAINING") {
      return Response.json({ error: "Cannot exceed the remaining amount" }, { status: 422 });
    }
    if (msg === "AMOUNT_INVALID") {
      return Response.json({ error: "Amount must be greater than 0" }, { status: 422 });
    }
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
