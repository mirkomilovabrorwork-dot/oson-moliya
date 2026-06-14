import { NextRequest } from "next/server";
import { DebtDirection, DebtStatus } from "@prisma/client";
import { getSessionUser } from "@/lib/auth/session";
import { createDebt, listDebts, getDebtTotals } from "@/lib/services/debts";
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

export async function GET(request: NextRequest): Promise<Response> {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = request.nextUrl;
  const directionParam = url.searchParams.get("direction");
  const statusParam = url.searchParams.get("status");
  const totalsParam = url.searchParams.get("totals");

  // ?totals=1 → return { givenOpen, takenOpen } only
  if (totalsParam === "1") {
    const totals = await getDebtTotals(user.id);
    return Response.json(serializeBigInt(totals));
  }

  let direction: DebtDirection | undefined;
  if (directionParam === "given") direction = DebtDirection.given;
  else if (directionParam === "taken") direction = DebtDirection.taken;

  let status: DebtStatus | undefined;
  if (statusParam === "open") status = DebtStatus.open;
  else if (statusParam === "settled") status = DebtStatus.settled;

  const debts = await listDebts(user.id, { direction, status });
  return Response.json(serializeBigInt(debts));
}

const CreateDebtSchema = z.object({
  counterparty: z.string().min(1).max(200),
  amountUzs: AmountUzsSchema,
  direction: z.enum(["given", "taken"]),
  note: z.string().max(500).optional().nullable(),
  occurredAt: z.string().optional().nullable(),
});

export async function POST(request: NextRequest): Promise<Response> {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreateDebtSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.format() },
      { status: 422 }
    );
  }

  const data = parsed.data;
  const debt = await createDebt({
    userId: user.id,
    counterparty: data.counterparty,
    amountUzs: data.amountUzs,
    direction: data.direction === "given" ? DebtDirection.given : DebtDirection.taken,
    note: data.note ?? null,
    occurredAt: data.occurredAt ? new Date(data.occurredAt) : new Date(),
  });

  return Response.json(serializeBigInt(debt), { status: 201 });
}
