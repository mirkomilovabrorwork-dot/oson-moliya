import "dotenv/config";
import { db } from "../src/lib/db";
import { issueMagicToken } from "../src/lib/auth/token";

// Seeds a demo workspace with realistic data, then prints a magic-link to view it.
async function main(): Promise<void> {
  const prisma = db as unknown as import("@prisma/client").PrismaClient;
  const telegramId = BigInt(999000001);

  await prisma.user.deleteMany({ where: { telegramId } }); // reset prior demo data (cascade)
  const user = await prisma.user.create({
    data: { telegramId, firstName: "Demo", language: "uz" },
  });

  const defs: [string, "income" | "expense", string][] = [
    ["sotuv", "income", "💰"],
    ["logistika", "expense", "🚚"],
    ["ijara", "expense", "🏠"],
    ["oylik", "expense", "👥"],
    ["reklama", "expense", "📣"],
    ["mahsulot", "expense", "📦"],
  ];
  const cats: Record<string, string> = {};
  for (const [name, type, emoji] of defs) {
    const c = await prisma.category.create({
      data: { userId: user.id, name, type, emoji, isDefault: true },
    });
    cats[name] = c.id;
  }

  const day = (offset: number): Date => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - offset);
    return d;
  };

  const txs: [string, "income" | "expense", number, number][] = [
    ["sotuv", "income", 2500000, 1], ["sotuv", "income", 1800000, 3],
    ["sotuv", "income", 3200000, 6], ["sotuv", "income", 1500000, 10],
    ["logistika", "expense", 500000, 1], ["logistika", "expense", 700000, 4],
    ["logistika", "expense", 900000, 8], ["ijara", "expense", 1500000, 2],
    ["oylik", "expense", 2000000, 5], ["reklama", "expense", 400000, 7],
    ["mahsulot", "expense", 1200000, 9],
    // last month (for trend / last-month view)
    ["sotuv", "income", 2000000, 35], ["logistika", "expense", 600000, 33],
    ["ijara", "expense", 1500000, 32],
  ];
  for (const [cat, type, amt, off] of txs) {
    await prisma.transaction.create({
      data: { userId: user.id, categoryId: cats[cat], type, amountUzs: BigInt(amt), occurredAt: day(off), source: "dashboard" },
    });
  }

  // logistika: spent 2,100,000 this month vs 1,500,000 limit -> OVER (red bar)
  await prisma.budget.create({ data: { userId: user.id, categoryId: cats["logistika"], limitUzs: BigInt(1500000) } });
  // reklama: spent 400,000 vs 1,000,000 -> under (green bar)
  await prisma.budget.create({ data: { userId: user.id, categoryId: cats["reklama"], limitUzs: BigInt(1000000) } });

  const token = await issueMagicToken(user.id);
  console.log("AUTH_URL=http://localhost:3000/api/auth/verify?token=" + token);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
