import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { resolveLang, t } from "@/lib/i18n";
import { TopNav } from "@/components/TopNav";
import { BottomNav } from "@/components/BottomNav";
import { AddSheet } from "@/components/AddSheet";
import { listDebts, getDebtTotals } from "@/lib/services/debts";
import { serializeBigInt } from "@/lib/serialize";
import { DebtsClient } from "./DebtsClient";

export const dynamic = "force-dynamic";

export default async function DebtsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const lang = await resolveLang(user.language);

  const [debts, totals] = await Promise.all([
    listDebts(user.id),
    getDebtTotals(user.id),
  ]);

  // Serialize BigInt for client component
  const serializedDebts = serializeBigInt(debts) as Array<{
    id: string;
    counterparty: string;
    amountUzs: string;
    direction: "given" | "taken";
    status: "open" | "settled";
    note: string | null;
    occurredAt: string;
    settledAt: string | null;
  }>;

  const serializedTotals = serializeBigInt(totals) as {
    givenOpen: string;
    takenOpen: string;
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <TopNav lang={lang} />
      <BottomNav lang={lang} />
      <AddSheet lang={lang} />
      <main className="max-w-2xl mx-auto px-4 sm:px-8 py-6 pb-28">
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: "var(--fg)" }}>
            {t("debt.title", lang)}
          </h1>
        </div>

        <DebtsClient
          debts={serializedDebts}
          totals={serializedTotals}
          lang={lang}
        />
      </main>
    </div>
  );
}
