import { getSessionUser } from "@/lib/auth/session";
import { resolveLang, t } from "@/lib/i18n";
import { db } from "@/lib/db";
import { TopNav } from "@/components/TopNav";
import { BottomNav } from "@/components/BottomNav";
import { AddSheet } from "@/components/AddSheet";
import { TransactionsClient } from "./TransactionsClient";
import { redirect } from "next/navigation";
import { getRates } from "@/lib/rates";
import type { DisplayCurrency, Rates } from "@/lib/rates";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const lang = await resolveLang(user.language);
  const currency = (user.displayCurrency ?? "UZS") as DisplayCurrency;
  const rates: Rates = await getRates();
  const prisma = db as import("@prisma/client").PrismaClient;

  const categories = await prisma.category.findMany({
    where: { userId: user.id },
    select: { id: true, name: true, type: true, emoji: true },
    orderBy: { name: "asc" },
  });

  const transactions = await prisma.transaction.findMany({
    where: { userId: user.id, deletedAt: null },
    orderBy: { occurredAt: "desc" },
    take: 500,
    include: { category: true },
  });

  const txList = transactions.map((tx) => ({
    id: tx.id,
    type: tx.type as "income" | "expense",
    amountUzs: tx.amountUzs.toString(),
    categoryId: tx.categoryId,
    categoryName: tx.category?.name ?? null,
    categoryEmoji: tx.category?.emoji ?? null,
    note: tx.note,
    occurredAt: tx.occurredAt.toISOString(),
    source: tx.source,
  }));

  const catList = categories.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type as "income" | "expense",
    emoji: c.emoji,
  }));

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <TopNav lang={lang} />
      <BottomNav lang={lang} />
      <AddSheet lang={lang} />
      <main className="max-w-5xl mx-auto px-4 sm:px-8 py-6 pb-28 space-y-5">
        <h1
          className="text-xs font-semibold uppercase tracking-wide pl-1"
          style={{ color: "var(--fg-subtle)" }}
        >
          {t("transactions.title", lang)}
        </h1>
        <TransactionsClient transactions={txList} categories={catList} lang={lang} currency={currency} rates={rates} />
      </main>
    </div>
  );
}
