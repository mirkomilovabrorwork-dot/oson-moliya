import { NextRequest } from "next/server";
import { AccountType } from "@prisma/client";
import { getSessionUser } from "@/lib/auth/session";
import {
  listAccounts,
  createAccount,
  getTotalBalance,
} from "@/lib/services/accounts";
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

const CreateAccountSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["cash", "card", "other"]).default("cash"),
  initialBalanceUzs: InitialBalanceSchema,
});

export async function GET(request: NextRequest): Promise<Response> {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = request.nextUrl;
  const totalParam = url.searchParams.get("total");

  if (totalParam === "1") {
    const total = await getTotalBalance(user.id);
    return Response.json(serializeBigInt({ total }));
  }

  const accounts = await listAccounts(user.id);
  return Response.json(serializeBigInt(accounts));
}

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

  const parsed = CreateAccountSchema.safeParse(body);
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

  const account = await createAccount({
    userId: user.id,
    name: data.name,
    type: typeMap[data.type],
    initialBalanceUzs: data.initialBalanceUzs ?? 0n,
  });

  return Response.json(serializeBigInt(account), { status: 201 });
}
