import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { restoreDebt } from "@/lib/services/debts";
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
  const result = await restoreDebt(id, user.id);

  if (!result) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json(serializeBigInt(result));
}
