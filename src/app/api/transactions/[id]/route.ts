import { NextRequest } from "next/server";
import { TxType } from "@prisma/client";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { serializeBigInt } from "@/lib/serialize";
import { z } from "zod";

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

const PatchSchema = z.object({
  type: z.enum(["income", "expense"]).optional(),
  amountUzs: AmountUzsSchema.optional(),
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
  const nextType = data.type
    ? data.type === "income"
      ? TxType.income
      : TxType.expense
    : existing.type;
  let nextCategoryId = data.categoryId;
  if (data.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: data.categoryId, userId: user.id, type: nextType },
    });
    if (!category) {
      return Response.json(
        { error: "Category not found for this transaction type" },
        { status: 422 }
      );
    }
  } else if (data.type && data.categoryId === undefined && existing.categoryId) {
    const existingCategory = await prisma.category.findFirst({
      where: { id: existing.categoryId, userId: user.id, type: nextType },
    });
    if (!existingCategory) {
      nextCategoryId = null;
    }
  }

  const updated = await prisma.transaction.update({
    where: { id },
    data: {
      type: data.type ? nextType : undefined,
      amountUzs: data.amountUzs,
      categoryId: nextCategoryId,
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
