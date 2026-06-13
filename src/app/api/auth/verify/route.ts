import { redirect } from "next/navigation";
import { consumeMagicToken } from "@/lib/auth/token";
import { createSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return redirect("/login");
  }

  const userId = await consumeMagicToken(token);
  if (!userId) {
    // Invalid or expired token
    return redirect("/login?error=expired");
  }

  await createSession(userId);

  // Check if the user has any transactions — redirect to onboarding if not
  const prisma = db as import("@prisma/client").PrismaClient;
  const txCount = await prisma.transaction.count({
    where: { userId, deletedAt: null },
  });

  if (txCount === 0) {
    return redirect("/onboarding");
  }

  return redirect("/");
}
