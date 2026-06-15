import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { resolveLang, t } from "@/lib/i18n";
import { TopNav } from "@/components/TopNav";
import { BottomNav } from "@/components/BottomNav";
import { AddSheet } from "@/components/AddSheet";
import { listAccounts } from "@/lib/services/accounts";
import { serializeBigInt } from "@/lib/serialize";
import type { DisplayCurrency } from "@/lib/rates";
import { ImportClient } from "./ImportClient";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const lang = await resolveLang(user.language);
  const rawCurrency = user.displayCurrency ?? "UZS";
  const currency: DisplayCurrency = (["UZS", "USD", "EUR", "RUB"].includes(rawCurrency)
    ? rawCurrency
    : "UZS") as DisplayCurrency;

  const accounts = await listAccounts(user.id);
  const serializedAccounts = serializeBigInt(accounts) as Array<{
    id: string;
    name: string;
    type: string;
  }>;

  return (
    <div className="min-h-screen" style={{ background: "transparent" }}>
      <TopNav lang={lang} />
      <BottomNav lang={lang} />
      <AddSheet lang={lang} mainCurrency={currency} />
      <main className="max-w-2xl mx-auto px-4 sm:px-8 py-6 pb-28">
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: "var(--fg)" }}>
            {t("import.title", lang)}
          </h1>
        </div>
        <ImportClient accounts={serializedAccounts} lang={lang} />
      </main>
    </div>
  );
}
