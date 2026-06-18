import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { serializeBigInt } from "@/lib/serialize";
import { assertSameOrigin } from "@/lib/http/origin";

export const dynamic = "force-dynamic";

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

  const { id } = await params;
  const prisma = db as import("@prisma/client").PrismaClient;

  // Validate: must exist, belong to user, and be soft-deleted
  const existing = await prisma.transaction.findFirst({
    where: { id, userId: user.id, deletedAt: { not: null } },
  });
  if (!existing) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const restored = await prisma.transaction.update({
    where: { id, userId: user.id },
    data: { deletedAt: null },
    include: { category: true },
  });

  return Response.json(serializeBigInt(restored));
}
