import { NextRequest } from "next/server";
import { TxType } from "@prisma/client";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { serializeBigInt } from "@/lib/serialize";
import { z } from "zod";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  type: z.enum(["income", "expense"]).optional(),
  amountUzs: z
    .union([z.string(), z.number()])
    .transform((v) => BigInt(v))
    .optional(),
  categoryId: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  occurredAt: z.string().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const prisma = db as import("@prisma/client").PrismaClient;

  const existing = await prisma.transaction.findFirst({
    where: { id, userId: user.id, deletedAt: null },
  });
  if (!existing) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Validation failed" }, { status: 422 });
  }

  const data = parsed.data;
  const updated = await prisma.transaction.update({
    where: { id },
    data: {
      type: data.type ? (data.type === "income" ? TxType.income : TxType.expense) : undefined,
      amountUzs: data.amountUzs,
      categoryId: data.categoryId,
      note: data.note,
      occurredAt: data.occurredAt ? new Date(data.occurredAt) : undefined,
    },
    include: { category: true },
  });

  return Response.json(serializeBigInt(updated));
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const prisma = db as import("@prisma/client").PrismaClient;

  const existing = await prisma.transaction.findFirst({
    where: { id, userId: user.id, deletedAt: null },
  });
  if (!existing) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.transaction.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return new Response(null, { status: 204 });
}
