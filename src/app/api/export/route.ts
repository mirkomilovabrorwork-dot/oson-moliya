import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Escapes a single CSV field value.
 * Wraps in double-quotes if the value contains a comma, double-quote, or newline.
 * Doubles any internal double-quotes.
 */
function csvField(value: string | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(fields: (string | null | undefined)[]): string {
  return fields.map(csvField).join(",");
}

export async function GET(): Promise<Response> {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prisma = db as import("@prisma/client").PrismaClient;

  // Fetch all non-deleted transactions for this user, include category + account
  const transactions = await prisma.transaction.findMany({
    where: { userId: user.id, deletedAt: null },
    orderBy: { occurredAt: "desc" },
    include: { category: true, account: true },
  });

  // Fetch all debts for this user (both open and settled)
  const debts = await prisma.debt.findMany({
    where: { userId: user.id, deletedAt: null },
    orderBy: { occurredAt: "desc" },
  });

  const lines: string[] = [];

  // ── Transactions section ──
  lines.push("TRANSACTIONS");
  lines.push(
    csvRow([
      "Date",
      "Type",
      "Category",
      "Amount UZS",
      "Original Currency",
      "Original Amount",
      "Note",
      "Account",
      "Source",
    ])
  );

  for (const tx of transactions) {
    lines.push(
      csvRow([
        tx.occurredAt.toISOString().slice(0, 10),
        tx.type,
        tx.category?.name ?? "",
        String(tx.amountUzs),
        tx.originalCurrency ?? "",
        tx.originalAmount != null ? String(tx.originalAmount) : "",
        tx.note ?? "",
        tx.account?.name ?? "",
        tx.source,
      ])
    );
  }

  lines.push(""); // blank separator line

  // ── Debts section ──
  lines.push("DEBTS");
  lines.push(
    csvRow([
      "Counterparty",
      "Direction",
      "Amount UZS",
      "Status",
      "Note",
      "Date",
      "Settled Date",
    ])
  );

  for (const debt of debts) {
    lines.push(
      csvRow([
        debt.counterparty,
        debt.direction,
        String(debt.amountUzs),
        debt.status,
        debt.note ?? "",
        debt.occurredAt.toISOString().slice(0, 10),
        debt.settledAt ? debt.settledAt.toISOString().slice(0, 10) : "",
      ])
    );
  }

  const csv = lines.join("\n");

  const today = new Date().toISOString().slice(0, 10);
  const filename = `oson-moliya-export-${today}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
