import { NextRequest } from "next/server";
import { TxType } from "@prisma/client";
import { getSessionUser } from "@/lib/auth/session";
import { listTransactions, createTransaction } from "@/lib/services/transactions";
import { resolveOrCreateCategory } from "@/lib/services/categories";
import { serializeBigInt } from "@/lib/serialize";
import { db } from "@/lib/db";
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

  // Clamp limit and offset to safe ranges (R11)
  const rawLimit = Number(url.searchParams.get("limit") ?? "50");
  const rawOffset = Number(url.searchParams.get("offset") ?? "0");
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 50, 1), 100);
  const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);

  // Filters: type, category, from, to, search, accountId
  const typeParam = url.searchParams.get("type");
  const categoryParam = url.searchParams.get("category");
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const searchParam = url.searchParams.get("search");
  const accountIdParam = url.searchParams.get("accountId");

  // Validate date filters — return 422 instead of letting Prisma 500 (R11)
  if (fromParam && isNaN(new Date(fromParam).getTime())) {
    return Response.json({ error: "Invalid 'from' date" }, { status: 422 });
  }
  if (toParam && isNaN(new Date(toParam).getTime())) {
    return Response.json({ error: "Invalid 'to' date" }, { status: 422 });
  }

  // Resolve type filter
  let typeFilter: TxType | undefined;
  if (typeParam === "income") typeFilter = TxType.income;
  else if (typeParam === "expense") typeFilter = TxType.expense;

  // Resolve accountId filter — validate it belongs to the user
  let accountIdFilter: string | undefined | null;
  if (accountIdParam) {
    const prismaCheck = db as import("@prisma/client").PrismaClient;
    const acc = await prismaCheck.account.findFirst({
      where: { id: accountIdParam, userId: user.id },
      select: { id: true },
    });
    if (!acc) {
      // No matching account for this user → return empty
      return Response.json([]);
    }
    accountIdFilter = acc.id;
  }

  // Resolve category filter via name lookup
  let categoryIdFilter: string | undefined;
  if (categoryParam) {
    const prisma = db as import("@prisma/client").PrismaClient;
    const cat = await prisma.category.findFirst({
      where: {
        userId: user.id,
        name: { contains: categoryParam.toLowerCase(), mode: "insensitive" },
      },
    });
    if (cat) {
      categoryIdFilter = cat.id;
    } else {
      // No matching category → return empty result
      return Response.json([]);
    }
  }

  // Date filters
  const fromFilter = fromParam ? new Date(fromParam) : undefined;
  const toFilter = toParam ? new Date(toParam) : undefined;

  // Search: fetch more and filter in memory (no full-text index needed for MVP)
  if (searchParam) {
    const all = await listTransactions(user.id, {
      limit: 500,
      offset: 0,
      filters: {
        type: typeFilter,
        categoryId: categoryIdFilter,
        from: fromFilter,
        to: toFilter,
        accountId: accountIdFilter ?? undefined,
      },
    });
    const q = searchParam.toLowerCase();
    const filtered = all.filter(
      (tx) =>
        (tx.note && tx.note.toLowerCase().includes(q)) ||
        (tx.category?.name && tx.category.name.toLowerCase().includes(q))
    );
    return Response.json(serializeBigInt(filtered.slice(offset, offset + limit)));
  }

  const txs = await listTransactions(user.id, {
    limit,
    offset,
    filters: {
      type: typeFilter,
      categoryId: categoryIdFilter,
      from: fromFilter,
      to: toFilter,
      accountId: accountIdFilter ?? undefined,
    },
  });
  return Response.json(serializeBigInt(txs));
}

const CreateTransactionSchema = z.object({
  type: z.enum(["income", "expense"]),
  amountUzs: AmountUzsSchema,
  categoryId: z.string().optional().nullable(),
  categoryName: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  occurredAt: z.string().optional().nullable(),
  accountId: z.string().optional().nullable(),
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

  const parsed = CreateTransactionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.format() },
      { status: 422 }
    );
  }

  const data = parsed.data;
  const txType = data.type === "income" ? TxType.income : TxType.expense;
  const prisma = db as import("@prisma/client").PrismaClient;

  let categoryId: string | null = data.categoryId ?? null;
  if (categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: categoryId, userId: user.id, type: txType },
    });
    if (!category) {
      return Response.json(
        { error: "Category not found for this transaction type" },
        { status: 422 }
      );
    }
  } else if (data.categoryName) {
    categoryId = await resolveOrCreateCategory(user.id, data.categoryName, txType);
  }

  // Validate accountId if provided
  let resolvedAccountId: string | null = null;
  if (data.accountId) {
    const acc = await prisma.account.findFirst({
      where: { id: data.accountId, userId: user.id },
      select: { id: true },
    });
    if (!acc) {
      return Response.json(
        { error: "Account not found" },
        { status: 422 }
      );
    }
    resolvedAccountId = acc.id;
  }

  const tx = await createTransaction({
    userId: user.id,
    categoryId,
    accountId: resolvedAccountId,
    type: txType,
    amountUzs: data.amountUzs,
    note: data.note ?? null,
    occurredAt: data.occurredAt ? new Date(data.occurredAt) : new Date(),
    source: "dashboard",
  });

  return Response.json(serializeBigInt(tx), { status: 201 });
}
