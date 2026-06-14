import { headers } from "next/headers";
import { destroySession } from "@/lib/auth/session";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/http/origin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  try {
    await destroySession();
  } catch (err) {
    console.error("Logout error:", err);
  }
  // Build absolute URL from the request host
  const headerStore = await headers();
  const host = headerStore.get("host") ?? "localhost:3000";
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  return NextResponse.redirect(`${proto}://${host}/login`, { status: 303 });
}
