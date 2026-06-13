import { getSessionUser } from "@/lib/auth/session";
import { listTransactions } from "@/lib/services/transactions";
import { resolveLang, t } from "@/lib/i18n";
import Link from "next/link";
import { LangSwitcher } from "@/components/LangSwitcher";

export const dynamic = "force-dynamic";

function formatAmount(amount: bigint): string {
  return amount.toLocaleString("uz-UZ") + " so'm";
}

function formatDate(date: Date, lang: string): string {
  return new Intl.DateTimeFormat(
    lang === "ru" ? "ru-RU" : lang === "en" ? "en-US" : "uz-UZ",
    { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Tashkent" }
  ).format(date);
}

export default async function TransactionsPage() {
  const user = await getSessionUser();
  if (!user) return null;

  const lang = await resolveLang(user.language);
  const transactions = await listTransactions(user.id, { limit: 100 });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="font-bold text-blue-600 text-lg">PulTrack</span>
            <nav className="hidden sm:flex items-center gap-4 text-sm">
              <Link href="/" className="text-gray-600 hover:text-gray-900">
                {t("nav.overview", lang)}
              </Link>
              <Link href="/transactions" className="text-blue-600 font-medium">
                {t("nav.transactions", lang)}
              </Link>
              <span className="text-gray-400 cursor-default">{t("nav.analytics", lang)}</span>
              <span className="text-gray-400 cursor-default">{t("nav.categories", lang)}</span>
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

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <h1 className="text-xl font-bold text-gray-900">{t("transactions.title", lang)}</h1>

        {transactions.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center text-gray-400 border border-gray-100">
            {t("transactions.empty", lang)}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">
                      {t("transactions.date", lang)}
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">
                      {t("transactions.type", lang)}
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">
                      {t("transactions.category", lang)}
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500">
                      {t("transactions.amount", lang)}
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">
                      {t("transactions.note", lang)}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {formatDate(tx.occurredAt, lang)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            tx.type === "income"
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {t(`form.type.${tx.type}`, lang)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {tx.category
                          ? `${tx.category.emoji ?? ""} ${tx.category.name}`.trim()
                          : "—"}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-medium whitespace-nowrap ${
                          tx.type === "income" ? "text-green-600" : "text-red-500"
                        }`}
                      >
                        {tx.type === "income" ? "+" : "-"}{formatAmount(tx.amountUzs)}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {tx.note ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
