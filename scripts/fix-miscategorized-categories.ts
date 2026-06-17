/**
 * scripts/fix-miscategorized-categories.ts
 *
 * One-time cleanup: re-bucket categories whose name is canonical for the OPPOSITE
 * type (e.g. an income-typed "kommunal" category created before the A2 guard).
 *
 * SAFE — idempotent: a second run finds nothing to fix.
 * BOUNDED — only touches categories that are a KNOWN canonical of the opposite type.
 * NEVER drops custom or correctly-typed categories.
 *
 * DO NOT run this automatically. The orchestrator reviews the script and runs it
 * once against the live DB:
 *   npx tsx scripts/fix-miscategorized-categories.ts
 */

import { PrismaClient, TxType } from "@prisma/client";
import { CANONICAL_CATEGORY_DEFS } from "../src/lib/categories-i18n";
import { findCanonical } from "../src/lib/services/categories";

const prisma = new PrismaClient();

async function ensureBucket(
  userId: string,
  bucketKey: "boshqa kirim" | "boshqa chiqim",
  type: TxType
): Promise<string> {
  const def = CANONICAL_CATEGORY_DEFS.find((d) => d.key === bucketKey);
  const existing = await prisma.category.findUnique({
    where: { userId_name_type: { userId, name: bucketKey, type } },
  });
  if (existing) return existing.id;
  const created = await prisma.category.create({
    data: {
      userId,
      name: bucketKey,
      type,
      emoji: def?.emoji ?? null,
      isDefault: true,
    },
  });
  return created.id;
}

async function main() {
  console.log("fix-miscategorized-categories: starting scan…");

  // Fetch all categories
  const allCategories = await prisma.category.findMany({
    select: { id: true, userId: true, name: true, type: true },
  });

  // Filter: name is canonical of the OPPOSITE type
  const mismatchedByUser = new Map<
    string,
    Array<{ id: string; name: string; type: TxType }>
  >();
  for (const cat of allCategories) {
    const catTypeStr = cat.type === TxType.income ? "income" : "expense";
    const canonDef = findCanonical(cat.name); // no type filter
    if (!canonDef) continue; // not canonical at all — skip (custom)
    if (canonDef.type === catTypeStr) continue; // correctly typed — skip
    // It IS a canonical entry, but for the wrong type
    if (!mismatchedByUser.has(cat.userId)) mismatchedByUser.set(cat.userId, []);
    mismatchedByUser.get(cat.userId)!.push(cat);
  }

  if (mismatchedByUser.size === 0) {
    console.log("fix-miscategorized-categories: nothing to fix — already clean.");
    await prisma.$disconnect();
    return;
  }

  let totalFixed = 0;
  let totalTxMoved = 0;
  let totalBudgetsDeleted = 0;
  let totalCatsDeleted = 0;
  let totalErrors = 0;

  for (const [userId, cats] of mismatchedByUser) {
    try {
      console.log(`  user ${userId}: ${cats.length} mis-typed category(s)`);
      for (const cat of cats) {
        try {
          const bucketKey =
            cat.type === TxType.income ? "boshqa kirim" : "boshqa chiqim";
          const bucketId = await ensureBucket(userId, bucketKey, cat.type);

          // 1. Re-bucket all transactions
          const { count: txCount } = await prisma.transaction.updateMany({
            where: { categoryId: cat.id },
            data: { categoryId: bucketId },
          });
          totalTxMoved += txCount;

          // 2. Delete any budgets referencing this mis-typed category
          const { count: budgetCount } = await prisma.budget.deleteMany({
            where: { categoryId: cat.id },
          });
          totalBudgetsDeleted += budgetCount;

          // 3. Delete the mis-typed category
          await prisma.category.delete({ where: { id: cat.id } });
          totalCatsDeleted += 1;

          console.log(
            `    [OK] cat "${cat.name}" (${cat.type}) → rebucketed ${txCount} tx to "${bucketKey}", deleted ${budgetCount} budget(s)`
          );
        } catch (catErr) {
          totalErrors += 1;
          console.error(`    [ERR] cat "${cat.name}" id=${cat.id}:`, catErr);
        }
      }
      totalFixed += cats.length - 0; // count all attempted
    } catch (userErr) {
      totalErrors += 1;
      console.error(`  [ERR] user ${userId}:`, userErr);
    }
  }

  console.log("\nfix-miscategorized-categories: DONE");
  console.log(`  Categories deleted : ${totalCatsDeleted}`);
  console.log(`  Transactions moved : ${totalTxMoved}`);
  console.log(`  Budgets deleted    : ${totalBudgetsDeleted}`);
  console.log(`  Errors             : ${totalErrors}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("fix-miscategorized-categories: fatal error:", e);
  await prisma.$disconnect();
  process.exit(1);
});
