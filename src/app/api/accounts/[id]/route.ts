import { NextRequest } from "next/server";
import { AccountType } from "@prisma/client";
import { getSessionUser } from "@/lib/auth/session";
import { updateAccount, deleteAccount } from "@/lib/services/accounts";
import { serializeBigInt } from "@/lib/serialize";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/http/origin";

export const dynamic = "force-dynamic";

const InitialBalanceSchema = z.preprocess(
  (value) => {
    if (typeof value === "string") return value.replace(/\s/g, "");
    if (typeof value === "number" && Number.isInteger(value)) return String(value);
    return value;
  },
  z
    .string()
    .regex(/^\d+$/)
    .transform((value) => BigInt(value))
    .optional()
);

const PatchAccountSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(["cash", "card", "other"]).optional(),
  initialBalanceUzs: InitialBalanceSchema,
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

  const parsed = PatchAccountSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.format() },
      { status: 422 }
    );
  }

  const data = parsed.data;
  const typeMap: Record<string, AccountType> = {
    cash: AccountType.cash,
    card: AccountType.card,
    other: AccountType.other,
  };

  const updated = await updateAccount(id, user.id, {
    name: data.name,
    type: data.type ? typeMap[data.type] : undefined,
    initialBalanceUzs: data.initialBalanceUzs,
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
  const result = await deleteAccount(id, user.id);

  if (!result) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}
