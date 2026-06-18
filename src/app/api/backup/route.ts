import { getSessionUser } from "@/lib/auth/session";
import { serializeBigInt } from "@/lib/serialize";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch records the user owns, scoped by userId on every query.
  // Only add deletedAt: null on models that actually have that field
  // (Transaction, Debt, DebtPayment, RecurringRule). Category, Account,
  // and Budget do NOT have deletedAt in the schema.
  const [transactions, categories, accounts, budgets, debts, recurringRules] =
    await Promise.all([
      db.transaction.findMany({
        where: { userId: user.id, deletedAt: null },
        orderBy: { occurredAt: "desc" },
      }),
      db.category.findMany({ where: { userId: user.id } }),
      db.account.findMany({ where: { userId: user.id } }),
      db.budget.findMany({ where: { userId: user.id } }),
      db.debt.findMany({
        where: { userId: user.id, deletedAt: null },
        include: { payments: { where: { deletedAt: null } } },
      }),
      db.recurringRule.findMany({
        where: { userId: user.id, deletedAt: null },
      }),
    ]);

  const payload = serializeBigInt({
    app: "PulTrack",
    exportedAt: new Date().toISOString(),
    profile: {
      id: user.id,
      telegramId: user.telegramId,
      firstName: user.firstName ?? null,
      username: user.username ?? null,
      language: user.language,
      displayCurrency: user.displayCurrency,
      createdAt: user.createdAt,
    },
    transactions,
    categories,
    accounts,
    budgets,
    debts,
    recurringRules,
  });

  const filename = `pultrack-backup-${new Date().toISOString().slice(0, 10)}.json`;
  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
