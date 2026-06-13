import { NextRequest } from "next/server";
import { TxType } from "@prisma/client";
import { getSessionUser } from "@/lib/auth/session";
import { listTransactions, createTransaction } from "@/lib/services/transactions";
import { resolveOrCreateCategory } from "@/lib/services/categories";
import { serializeBigInt } from "@/lib/serialize";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = request.nextUrl;
  const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

  const txs = await listTransactions(user.id, { limit, offset });
  return Response.json(serializeBigInt(txs));
}

const CreateTransactionSchema = z.object({
  type: z.enum(["income", "expense"]),
  amountUzs: z.union([z.string(), z.number()]).transform((v) => BigInt(v)),
  categoryId: z.string().optional().nullable(),
  categoryName: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  occurredAt: z.string().optional().nullable(),
});

export async function POST(request: NextRequest): Promise<Response> {
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

  let categoryId: string | null = data.categoryId ?? null;
  if (!categoryId && data.categoryName) {
    categoryId = await resolveOrCreateCategory(user.id, data.categoryName, txType);
  }

  const tx = await createTransaction({
    userId: user.id,
    categoryId,
    type: txType,
    amountUzs: data.amountUzs,
    note: data.note ?? null,
    occurredAt: data.occurredAt ? new Date(data.occurredAt) : new Date(),
    source: "dashboard",
  });

  return Response.json(serializeBigInt(tx), { status: 201 });
}
