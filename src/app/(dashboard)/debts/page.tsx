import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { resolveLang, t } from "@/lib/i18n";
import { TopNav } from "@/components/TopNav";
import { BottomNav } from "@/components/BottomNav";
import { AddSheet } from "@/components/AddSheet";
import { listDebts, getDebtTotals } from "@/lib/services/debts";
import { serializeBigInt } from "@/lib/serialize";
import { DebtsClient } from "./DebtsClient";
import { getRates } from "@/lib/rates";
import type { DisplayCurrency, Rates } from "@/lib/rates";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DebtsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const lang = await resolveLang(user.language);
  // Treat any unknown/legacy value (e.g. "ORIGINAL") as "UZS"
  const rawCurrencyRaw = user.displayCurrency ?? "UZS";
  const currency: DisplayCurrency = (["UZS", "USD", "EUR", "RUB"].includes(rawCurrencyRaw) ? rawCurrencyRaw : "UZS") as DisplayCurrency;
  const rates: Rates = await getRates();

  const prisma = db as import("@prisma/client").PrismaClient;

  const [debts, totals, paymentSums] = await Promise.all([
    listDebts(user.id),
    getDebtTotals(user.id),
    prisma.debtPayment.groupBy({
      by: ["debtId"],
      where: { deletedAt: null, debt: { userId: user.id } },
      _sum: { amountUzs: true },
    }),
  ]);

  // Build a map of debtId → paidUzs (BigInt)
  const paidMap = new Map<string, bigint>();
  for (const row of paymentSums) {
    paidMap.set(row.debtId, (row._sum.amountUzs ?? 0n) as bigint);
  }

  // Serialize BigInt for client component, adding paidUzs per debt
  const serializedDebts = (serializeBigInt(
    debts.map((d) => ({ ...d, paidUzs: paidMap.get(d.id) ?? 0n }))
  )) as Array<{
    id: string;
    counterparty: string;
    amountUzs: string;
    direction: "given" | "taken";
    status: "open" | "settled";
    note: string | null;
    occurredAt: string;
    settledAt: string | null;
    paidUzs: string;
  }>;

  const serializedTotals = serializeBigInt(totals) as {
    givenOpen: string;
    takenOpen: string;
  };

  return (
    <div className="min-h-screen" style={{ background: "transparent" }}>
      <TopNav lang={lang} />
      <BottomNav lang={lang} />
      <AddSheet lang={lang} mainCurrency={currency} />
      <main className="max-w-2xl mx-auto px-4 sm:px-8 py-5 sm:py-7 pb-32">
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: "var(--fg)" }}>
            {t("debt.title", lang)}
          </h1>
        </div>

        <DebtsClient
          debts={serializedDebts}
          totals={serializedTotals}
          lang={lang}
          currency={currency}
          rates={rates}
        />
      </main>
    </div>
  );
}
