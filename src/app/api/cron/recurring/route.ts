import { NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { generateDueTransactions } from "@/lib/services/recurring";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  const env = getEnv();
  const authHeader = request.headers.get("Authorization");
  const expected = `Bearer ${env.CRON_SECRET}`;
  if (!authHeader || authHeader !== expected) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("[cron/recurring] Starting generateDueTransactions...");
    const result = await generateDueTransactions();
    console.log("[cron/recurring] Done:", JSON.stringify(result));
    return Response.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron/recurring] Fatal error:", msg);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
