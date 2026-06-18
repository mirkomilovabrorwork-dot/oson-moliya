import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { resolveLang } from "@/lib/i18n";
import { TopNav } from "@/components/TopNav";
import { BottomNav } from "@/components/BottomNav";
import { AddSheet } from "@/components/AddSheet";
import { listActiveRules } from "@/lib/services/recurring";
import { serializeBigInt } from "@/lib/serialize";
import { db } from "@/lib/db";
import { RecurringClient } from "./RecurringClient";
import type { DisplayCurrency } from "@/lib/rates";

export const dynamic = "force-dynamic";

export default async function RecurringPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const lang = await resolveLang(user.language);
  const rawCurrency = user.displayCurrency ?? "UZS";
  const currency: DisplayCurrency = (["UZS", "USD", "EUR", "RUB"].includes(rawCurrency) ? rawCurrency : "UZS") as DisplayCurrency;

  const prisma = db as import("@prisma/client").PrismaClient;

  const [rules, categories] = await Promise.all([
    listActiveRules(user.id),
    prisma.category.findMany({
      where: { userId: user.id },
      orderBy: { name: "asc" },
    }),
  ]);

  const serializedRules = serializeBigInt(rules) as Array<{
    id: string;
    type: "income" | "expense";
    categoryId: string | null;
    category: { id: string; name: string; emoji: string | null; type: "income" | "expense" } | null;
    amountUzs: string;
    originalCurrency: string | null;
    originalAmount: string | null;
    note: string | null;
    frequency: "monthly" | "yearly";
    dayOfMonth: number;
    monthOfYear: number | null;
    startDate: string;
    endDate: string | null;
    pausedAt: string | null;
    lastGeneratedAt: string | null;
    createdAt: string;
  }>;

  const serializedCategories = categories.map((c) => ({
    id: c.id,
    name: c.name,
    emoji: c.emoji,
    type: c.type as "income" | "expense",
  }));

  return (
    <div className="min-h-screen" style={{ background: "transparent" }}>
      <TopNav lang={lang} />
      <BottomNav lang={lang} />
      <AddSheet lang={lang} mainCurrency={currency} />
      <main className="max-w-2xl mx-auto px-4 sm:px-8 py-5 sm:py-7 pb-32">
        <RecurringClient
          rules={serializedRules}
          categories={serializedCategories}
          lang={lang}
        />
      </main>
    </div>
  );
}
