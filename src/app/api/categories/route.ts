import { NextRequest } from "next/server";
import { TxType } from "@prisma/client";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { serializeBigInt } from "@/lib/serialize";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/http/origin";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prisma = db as import("@prisma/client").PrismaClient;
  const categories = await prisma.category.findMany({
    where: { userId: user.id },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });

  return Response.json(serializeBigInt(categories));
}

const CreateCategorySchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["income", "expense"]),
  emoji: z.string().nullable().optional(),
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

  const parsed = CreateCategorySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.format() },
      { status: 422 }
    );
  }

  const { name, type, emoji } = parsed.data;
  const normalizedName = name.trim().toLowerCase();
  const txType = type === "income" ? TxType.income : TxType.expense;

  const prisma = db as import("@prisma/client").PrismaClient;

  // Prevent duplicates per [userId, name, type]
  const existing = await prisma.category.findUnique({
    where: { userId_name_type: { userId: user.id, name: normalizedName, type: txType } },
  });
  if (existing) {
    return Response.json({ error: "Category already exists" }, { status: 409 });
  }

  const created = await prisma.category.create({
    data: {
      userId: user.id,
      name: normalizedName,
      type: txType,
      emoji: emoji ?? null,
      isDefault: false,
    },
  });

  return Response.json(serializeBigInt(created), { status: 201 });
}
