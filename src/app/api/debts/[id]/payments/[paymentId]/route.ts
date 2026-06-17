import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { deleteDebtPayment } from "@/lib/services/debts";
import { assertSameOrigin } from "@/lib/http/origin";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
): Promise<Response> {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { paymentId } = await params;

  const result = await deleteDebtPayment(paymentId, user.id);
  if (!result) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}
