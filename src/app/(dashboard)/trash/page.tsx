import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { resolveLang, t } from "@/lib/i18n";
import { TopNav } from "@/components/TopNav";
import { BottomNav } from "@/components/BottomNav";
import { AddSheet } from "@/components/AddSheet";
import { db } from "@/lib/db";
import { serializeBigInt } from "@/lib/serialize";
import { TrashClient } from "./TrashClient";
import type { DisplayCurrency } from "@/lib/rates";

export const dynamic = "force-dynamic";

export default async function TrashPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const lang = await resolveLang(user.language);
  const rawCurrency = user.displayCurrency ?? "UZS";
  const currency: DisplayCurrency = (["UZS", "USD", "EUR", "RUB"].includes(rawCurrency)
    ? rawCurrency
    : "UZS") as DisplayCurrency;

  const prisma = db as import("@prisma/client").PrismaClient;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [transactions, debts, recurringRules] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId: user.id, deletedAt: { not: null, gte: since } },
      include: { category: true },
      orderBy: { deletedAt: "desc" },
    }),
    prisma.debt.findMany({
      where: { userId: user.id, deletedAt: { not: null, gte: since } },
      orderBy: { deletedAt: "desc" },
    }),
    prisma.recurringRule.findMany({
      where: { userId: user.id, deletedAt: { not: null, gte: since } },
      include: { category: true },
      orderBy: { deletedAt: "desc" },
    }),
  ]);

  return (
    <div className="min-h-screen" style={{ background: "transparent" }}>
      <TopNav lang={lang} />
      <BottomNav lang={lang} />
      <AddSheet lang={lang} mainCurrency={currency} />
      <main className="max-w-2xl mx-auto px-4 sm:px-8 py-5 sm:py-7 pb-32">
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: "var(--fg)" }}>
            {t("trash.title", lang)}
          </h1>
        </div>

        <TrashClient
          transactions={serializeBigInt(transactions) as Parameters<typeof TrashClient>[0]["transactions"]}
          debts={serializeBigInt(debts) as Parameters<typeof TrashClient>[0]["debts"]}
          recurringRules={serializeBigInt(recurringRules) as Parameters<typeof TrashClient>[0]["recurringRules"]}
          lang={lang}
        />
      </main>
    </div>
  );
}
