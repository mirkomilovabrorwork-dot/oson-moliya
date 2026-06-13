import { TxType } from "@prisma/client";
import { db } from "../db";

interface DefaultCategory {
  name: string;
  type: TxType;
  emoji: string;
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  // Income
  { name: "sotuv", type: TxType.income, emoji: "💰" },
  { name: "boshqa kirim", type: TxType.income, emoji: "📥" },
  // Expense
  { name: "logistika", type: TxType.expense, emoji: "🚚" },
  { name: "oylik", type: TxType.expense, emoji: "👷" },
  { name: "ijara", type: TxType.expense, emoji: "🏠" },
  { name: "mahsulot", type: TxType.expense, emoji: "📦" },
  { name: "kommunal", type: TxType.expense, emoji: "💡" },
  { name: "reklama", type: TxType.expense, emoji: "📢" },
  { name: "boshqa chiqim", type: TxType.expense, emoji: "📤" },
];

export async function ensureDefaultCategories(userId: string): Promise<void> {
  for (const cat of DEFAULT_CATEGORIES) {
    await (db as import("@prisma/client").PrismaClient).category.upsert({
      where: { userId_name_type: { userId, name: cat.name, type: cat.type } },
      create: {
        userId,
        name: cat.name,
        type: cat.type,
        emoji: cat.emoji,
        isDefault: true,
      },
      update: {},
    });
  }
}

export async function resolveOrCreateCategory(
  userId: string,
  name: string,
  type: TxType
): Promise<string> {
  const normalizedName = name.toLowerCase().trim();
  const existing = await (db as import("@prisma/client").PrismaClient).category.findUnique({
    where: { userId_name_type: { userId, name: normalizedName, type } },
  });
  if (existing) return existing.id;

  const created = await (db as import("@prisma/client").PrismaClient).category.create({
    data: { userId, name: normalizedName, type, isDefault: false },
  });
  return created.id;
}
