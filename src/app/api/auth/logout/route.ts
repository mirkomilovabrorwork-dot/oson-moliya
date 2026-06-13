import { redirect } from "next/navigation";
import { destroySession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    await destroySession();
  } catch (err) {
    console.error("Logout error:", err);
  }
  return redirect("/login");
}
