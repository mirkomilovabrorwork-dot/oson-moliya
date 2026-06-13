import { getSessionUser } from "@/lib/auth/session";
import { getOverview } from "@/lib/services/transactions";
import { db } from "@/lib/db";
import { resolveLang, t } from "@/lib/i18n";
import { StatCard } from "@/components/StatCard";
import { QuickAddForm } from "@/components/QuickAddForm";
import Link from "next/link";
import { LangSwitcher } from "@/components/LangSwitcher";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const lang = await resolveLang(user.language);
  const overview = await getOverview(user.id, "this_month");

  const prisma = db as import("@prisma/client").PrismaClient;
  const categories = await prisma.category.findMany({
    where: { userId: user.id },
    select: { id: true, name: true, type: true, emoji: true },
    orderBy: { name: "asc" },
  });

  const serializedCategories = categories.map((c) => ({
    ...c,
    type: c.type as string,
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="font-bold text-blue-600 text-lg">PulTrack</span>
            <nav className="hidden sm:flex items-center gap-4 text-sm">
              <Link href="/" className="text-blue-600 font-medium">
                {t("nav.overview", lang)}
              </Link>
              <Link href="/transactions" className="text-gray-600 hover:text-gray-900">
                {t("nav.transactions", lang)}
              </Link>
              <span className="text-gray-400 cursor-default" title={t("common.coming_soon", lang)}>
                {t("nav.analytics", lang)}
              </span>
              <span className="text-gray-400 cursor-default" title={t("common.coming_soon", lang)}>
                {t("nav.categories", lang)}
              </span>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <LangSwitcher currentLang={lang} />
            <Link href="/api/auth/logout" className="text-sm text-gray-500 hover:text-gray-700">
              {t("nav.logout", lang)}
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <h1 className="text-xl font-bold text-gray-900">{t("overview.title", lang)}</h1>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label={t("overview.income", lang)}
            amount={overview.income.toString()}
            prevAmount={overview.prevIncome.toString()}
            type="income"
            comparisonLabel={t("overview.vs_last_month", lang)}
          />
          <StatCard
            label={t("overview.expense", lang)}
            amount={overview.expense.toString()}
            prevAmount={overview.prevExpense.toString()}
            type="expense"
            comparisonLabel={t("overview.vs_last_month", lang)}
          />
          <StatCard
            label={t("overview.net", lang)}
            amount={overview.net.toString()}
            prevAmount={overview.prevNet.toString()}
            type="net"
            comparisonLabel={t("overview.vs_last_month", lang)}
          />
        </div>

        {/* Quick add form */}
        <QuickAddForm lang={lang} categories={serializedCategories} />
      </main>
    </div>
  );
}
