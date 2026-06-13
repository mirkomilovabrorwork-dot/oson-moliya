import { NextRequest } from "next/server";
import { TxType } from "@prisma/client";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { serializeBigInt } from "@/lib/serialize";
import { z } from "zod";

export const dynamic = "force-dynamic";

/** GET /api/budgets — list budgets with spent+percent for the current Tashkent month */
export async function GET(): Promise<Response> {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prisma = db as import("@prisma/client").PrismaClient;

  // Current Tashkent month window
  const now = new Date(Date.now() + 5 * 60 * 60 * 1000);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const monthStart = new Date(Date.UTC(year, month - 1, 1) - 5 * 60 * 60 * 1000);
  const monthEnd =
    month === 12
      ? new Date(Date.UTC(year + 1, 0, 1) - 5 * 60 * 60 * 1000)
      : new Date(Date.UTC(year, month, 1) - 5 * 60 * 60 * 1000);

  const budgets = await prisma.budget.findMany({
    where: { userId: user.id },
    include: { category: true },
  });

  // Aggregate this-month spend per category for the user's budget categories
  const categoryIds = budgets.map((b) => b.categoryId);
  const spendGroups =
    categoryIds.length > 0
      ? await prisma.transaction.groupBy({
          by: ["categoryId"],
          where: {
            userId: user.id,
            deletedAt: null,
            type: TxType.expense,
            categoryId: { in: categoryIds },
            occurredAt: { gte: monthStart, lt: monthEnd },
          },
          _sum: { amountUzs: true },
        })
      : [];

  const spendMap: Record<string, bigint> = {};
  for (const g of spendGroups) {
    if (g.categoryId) {
      spendMap[g.categoryId] = (g._sum.amountUzs ?? 0n) as bigint;
    }
  }

  const result = budgets.map((b) => {
    const spent = spendMap[b.categoryId] ?? 0n;
    const limit = b.limitUzs as bigint;
    const percent = limit > 0n ? Number((spent * 100n) / limit) : 0;
    return {
      categoryId: b.categoryId,
      categoryName: b.category.name,
      limitUzs: limit.toString(),
      spentUzs: spent.toString(),
      percent,
    };
  });

  return Response.json(serializeBigInt(result));
}

const UpsertBudgetSchema = z.object({
  categoryId: z.string().min(1),
  limitUzs: z.union([z.string(), z.number()]).transform((v) => {
    const s = String(v).replace(/\s/g, "");
    return s === "" ? null : BigInt(s);
  }),
});

/** PUT /api/budgets — upsert a budget for a category (limitUzs="" removes it) */
export async function PUT(request: NextRequest): Promise<Response> {
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

  const parsed = UpsertBudgetSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.format() },
      { status: 422 }
    );
  }

  const { categoryId, limitUzs } = parsed.data;
  const prisma = db as import("@prisma/client").PrismaClient;

  // Owner-check: category must belong to the session user
  const cat = await prisma.category.findFirst({
    where: { id: categoryId, userId: user.id },
  });
  if (!cat) {
    return Response.json({ error: "Category not found" }, { status: 404 });
  }

  // If limitUzs is null/0 → delete the budget record
  if (limitUzs === null || limitUzs === 0n) {
    await prisma.budget.deleteMany({ where: { userId: user.id, categoryId } });
    return new Response(null, { status: 204 });
  }

  const budget = await prisma.budget.upsert({
    where: { userId_categoryId: { userId: user.id, categoryId } },
    create: { userId: user.id, categoryId, limitUzs },
    update: { limitUzs },
  });

  return Response.json(serializeBigInt(budget));
}
