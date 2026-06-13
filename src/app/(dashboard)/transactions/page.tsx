import { getSessionUser } from "@/lib/auth/session";
import { resolveLang, t } from "@/lib/i18n";
import { db } from "@/lib/db";
import { TopNav } from "@/components/TopNav";
import { TransactionsClient } from "./TransactionsClient";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const lang = await resolveLang(user.language);
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
    <div className="min-h-screen" style={{ background: "var(--color-bg)" }}>
      <TopNav lang={lang} />
      <main className="max-w-5xl mx-auto px-5 sm:px-8 py-8 space-y-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>
          {t("transactions.title", lang)}
        </h1>
        <TransactionsClient transactions={txList} categories={catList} lang={lang} />
      </main>
    </div>
  );
}
