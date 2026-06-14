import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { resolveLang, t } from "@/lib/i18n";
import { TopNav } from "@/components/TopNav";
import { BottomNav } from "@/components/BottomNav";
import { AddSheet } from "@/components/AddSheet";
import { listAccounts, getTotalBalance } from "@/lib/services/accounts";
import { serializeBigInt } from "@/lib/serialize";
import { AccountsClient } from "./AccountsClient";
import { getRates } from "@/lib/rates";
import type { DisplayCurrency, Rates } from "@/lib/rates";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const lang = await resolveLang(user.language);
  // Treat any unknown/legacy value (e.g. "ORIGINAL") as "UZS"
  const rawCurrencyRaw = user.displayCurrency ?? "UZS";
  const currency: DisplayCurrency = (["UZS", "USD", "EUR", "RUB"].includes(rawCurrencyRaw) ? rawCurrencyRaw : "UZS") as DisplayCurrency;
  const rates: Rates = await getRates();

  const [accounts, totalBalance] = await Promise.all([
    listAccounts(user.id),
    getTotalBalance(user.id),
  ]);

  const serializedAccounts = serializeBigInt(accounts) as Array<{
    id: string;
    name: string;
    type: "cash" | "card" | "other";
    initialBalanceUzs: string;
    balance: string;
    createdAt: string;
  }>;

  const serializedTotal = (totalBalance as bigint).toString();

  return (
    <div className="min-h-screen" style={{ background: "transparent" }}>
      <TopNav lang={lang} />
      <BottomNav lang={lang} />
      <AddSheet lang={lang} mainCurrency={currency} />
      <main className="max-w-2xl mx-auto px-4 sm:px-8 py-6 pb-28">
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: "var(--fg)" }}>
            {t("account.title", lang)}
          </h1>
        </div>

        <AccountsClient
          accounts={serializedAccounts}
          totalBalance={serializedTotal}
          lang={lang}
          currency={currency}
          rates={rates}
        />
      </main>
    </div>
  );
}
