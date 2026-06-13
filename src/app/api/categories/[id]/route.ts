import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { serializeBigInt } from "@/lib/serialize";
import { z } from "zod";

export const dynamic = "force-dynamic";

const PatchCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  emoji: z.string().nullable().optional(),
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

  const existing = await prisma.category.findFirst({
    where: { id, userId: user.id },
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

  const parsed = PatchCategorySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Validation failed" }, { status: 422 });
  }

  const { name, emoji } = parsed.data;
  const normalizedName = name ? name.trim().toLowerCase() : undefined;

  // Check for duplicate if renaming
  if (normalizedName && normalizedName !== existing.name) {
    const duplicate = await prisma.category.findUnique({
      where: {
        userId_name_type: {
          userId: user.id,
          name: normalizedName,
          type: existing.type,
        },
      },
    });
    if (duplicate) {
      return Response.json({ error: "Category with that name already exists" }, { status: 409 });
    }
  }

  const updated = await prisma.category.update({
    where: { id },
    data: {
      ...(normalizedName !== undefined ? { name: normalizedName } : {}),
      ...(emoji !== undefined ? { emoji } : {}),
    },
  });

  return Response.json(serializeBigInt(updated));
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const prisma = db as import("@prisma/client").PrismaClient;

  const existing = await prisma.category.findFirst({
    where: { id, userId: user.id },
  });
  if (!existing) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const hasBudget = await prisma.budget.findUnique({
    where: { userId_categoryId: { userId: user.id, categoryId: id } },
    select: { id: true },
  });
  const confirmedBudgetDelete =
    request.nextUrl.searchParams.get("confirmBudget") === "1";
  if (hasBudget && !confirmedBudgetDelete) {
    return Response.json(
      { error: "Category has a budget. Confirm before deleting." },
      { status: 409 }
    );
  }

  await prisma.category.delete({ where: { id } });

  return new Response(null, { status: 204 });
}
