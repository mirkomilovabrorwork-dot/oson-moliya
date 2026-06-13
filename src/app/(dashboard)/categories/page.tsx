import { getSessionUser } from "@/lib/auth/session";
import { resolveLang, t } from "@/lib/i18n";
import { db } from "@/lib/db";
import { TopNav } from "@/components/TopNav";
import { CategoriesClient } from "./CategoriesClient";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const lang = await resolveLang(user.language);
  const prisma = db as import("@prisma/client").PrismaClient;

  const categories = await prisma.category.findMany({
    where: { userId: user.id },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });

  // Fetch budgets for this user
  const budgets = await prisma.budget.findMany({
    where: { userId: user.id },
  });

  const budgetMap: Record<string, string> = {};
  for (const b of budgets) {
    budgetMap[b.categoryId] = b.limitUzs.toString();
  }

  // Count transactions per category
  const txCounts = await prisma.transaction.groupBy({
    by: ["categoryId"],
    where: { userId: user.id, deletedAt: null },
    _count: { id: true },
  });
  const countMap: Record<string, number> = {};
  for (const c of txCounts) {
    if (c.categoryId) countMap[c.categoryId] = c._count.id;
  }

  // Serialize
  const cats = categories.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type as "income" | "expense",
    emoji: c.emoji,
    isDefault: c.isDefault,
    txCount: countMap[c.id] ?? 0,
    budgetLimit: budgetMap[c.id] ?? null,
  }));

  return (
    <div className="min-h-screen" style={{ background: "var(--color-bg)" }}>
      <TopNav lang={lang} />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>
          {t("categories.title", lang)}
        </h1>
        <CategoriesClient categories={cats} lang={lang} />
      </main>
    </div>
  );
}
