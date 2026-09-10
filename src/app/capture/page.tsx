import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { resolveLang } from "@/lib/i18n";
import { redirect } from "next/navigation";
import { CaptureClient } from "@/components/capture/CaptureClient";
import { getTashkentNow } from "@/lib/dates";

export const dynamic = "force-dynamic";

/**
 * /capture — the app's launch URL (see docs/plans/2026-09-10-android-one-step-capture.md).
 * Server component: auth gate + the data the idle-home state (STATE H) needs on first
 * paint. Everything interactive (recording, upload, state machine) lives in CaptureClient.
 */
export default async function CapturePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Fcapture");

  const lang = await resolveLang(user.language);
  const prisma = db as import("@prisma/client").PrismaClient;

  const categories = await prisma.category.findMany({
    where: { userId: user.id },
    select: { id: true, name: true, type: true, emoji: true },
    orderBy: { name: "asc" },
  });

  // Tashkent [start, end) boundaries for "today", same UTC+5 shift as tashkentMonthRange.
  const tNow = getTashkentNow();
  const start = new Date(
    Date.UTC(tNow.getUTCFullYear(), tNow.getUTCMonth(), tNow.getUTCDate()) - 5 * 60 * 60 * 1000
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const todayRows = await prisma.transaction.findMany({
    where: { userId: user.id, deletedAt: null, occurredAt: { gte: start, lt: end } },
    orderBy: { occurredAt: "desc" },
    include: { category: true },
  });

  const todayTotal = todayRows.reduce((sum, tx) => {
    const amt = tx.type === "income" ? tx.amountUzs : -tx.amountUzs;
    return sum + amt;
  }, BigInt(0));

  const rawCurrency = user.displayCurrency ?? "UZS";
  const mainCurrency = (["UZS", "USD", "EUR", "RUB"].includes(rawCurrency) ? rawCurrency : "UZS") as
    | "UZS"
    | "USD"
    | "EUR"
    | "RUB";

  return (
    <CaptureClient
      lang={lang}
      categories={categories}
      mainCurrency={mainCurrency}
      todayCount={todayRows.length}
      todayTotal={todayTotal.toString()}
      todayRows={todayRows.slice(0, 5).map((tx) => ({
        id: tx.id,
        type: tx.type,
        amountUzs: tx.amountUzs.toString(),
        occurredAt: tx.occurredAt.toISOString(),
        categoryName: tx.category?.name ?? null,
        categoryEmoji: tx.category?.emoji ?? null,
      }))}
    />
  );
}
