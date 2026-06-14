import { getSessionUser } from "@/lib/auth/session";
import { resolveLang, t } from "@/lib/i18n";
import { db } from "@/lib/db";
import { TopNav } from "@/components/TopNav";
import { BottomNav } from "@/components/BottomNav";
import { AddSheet } from "@/components/AddSheet";
import { CategoriesClient } from "./CategoriesClient";
import { redirect } from "next/navigation";
import { getRates } from "@/lib/rates";
import type { DisplayCurrency, Rates } from "@/lib/rates";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const lang = await resolveLang(user.language);
  const rawCurrency = (user.displayCurrency ?? "ORIGINAL") as DisplayCurrency;
  // Categories/budgets show aggregates only — ORIGINAL maps to UZS
  const currency: DisplayCurrency = rawCurrency === "ORIGINAL" ? "UZS" : rawCurrency;
  const rates: Rates = await getRates();
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
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <TopNav lang={lang} />
      <BottomNav lang={lang} />
      <AddSheet lang={lang} />
      <main className="max-w-2xl mx-auto px-4 sm:px-8 py-6 pb-28 space-y-5">
        <h1
          className="text-xs font-semibold uppercase tracking-wide pl-1"
          style={{ color: "var(--fg-subtle)" }}
        >
          {t("categories.title", lang)}
        </h1>
        <CategoriesClient categories={cats} lang={lang} currency={currency} rates={rates} />
      </main>
    </div>
  );
}
