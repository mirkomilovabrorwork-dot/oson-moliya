/**
 * PUT /api/currency
 * Updates the authenticated user's displayCurrency preference.
 * Allowed values: UZS | USD | EUR | RUB
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/http/origin";
import { db } from "@/lib/db";

const Schema = z.object({
  currency: z.enum(["UZS", "USD", "EUR", "RUB"]),
});

export async function PUT(request: NextRequest) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid currency. Allowed: UZS, USD, EUR, RUB" },
      { status: 422 }
    );
  }

  const prisma = db as import("@prisma/client").PrismaClient;
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { displayCurrency: parsed.data.currency },
    select: { id: true, displayCurrency: true },
  });

  return NextResponse.json({ displayCurrency: updated.displayCurrency });
}
