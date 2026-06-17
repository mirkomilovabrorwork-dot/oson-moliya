import { TxType } from "@prisma/client";
import { db } from "../db";
import {
  CANONICAL_CATEGORY_DEFS,
  translateCategoryName,
  type CanonicalCategoryDef,
} from "../categories-i18n";

// Re-export so server code that previously imported from here still works.
export { translateCategoryName };
export type { CanonicalCategoryDef };
export { CANONICAL_CATEGORY_DEFS as CANONICAL_CATEGORIES };

// ── Convenience alias typed for server usage ──────────────────────────────────
export type CanonicalCategory = CanonicalCategoryDef;

// Pre-built lookup: any variant (uz/ru/en, lower-cased) → CanonicalCategoryDef
const _variantMap = new Map<string, CanonicalCategoryDef>();
for (const cat of CANONICAL_CATEGORY_DEFS) {
  for (const v of [cat.uz, cat.ru, cat.en, cat.key]) {
    if (v) _variantMap.set(v.toLowerCase().trim(), cat);
  }
}

/**
 * Find the canonical entry whose key matches `name` (any language variant).
 * Returns undefined when no canonical match is found.
 */
export function findCanonical(
  name: string,
  type?: "income" | "expense"
): CanonicalCategoryDef | undefined {
  const match = _variantMap.get(name.toLowerCase().trim());
  if (!match) return undefined;
  if (type && match.type !== type) return undefined;
  return match;
}

// ── Backwards-compat export (old DEFAULT_CATEGORIES shape) ───────────────────
export const DEFAULT_CATEGORIES = CANONICAL_CATEGORY_DEFS.map((c) => ({
  name: c.key,
  type: c.type === "income" ? TxType.income : TxType.expense,
  emoji: c.emoji,
}));

// ── DB helpers ────────────────────────────────────────────────────────────────

/**
 * Idempotent seed: INSERT any canonical default the user is missing.
 * Never updates or deletes existing rows.
 */
export async function ensureDefaultCategories(userId: string): Promise<void> {
  const prisma = db as import("@prisma/client").PrismaClient;
  for (const cat of DEFAULT_CATEGORIES) {
    await prisma.category.upsert({
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

/**
 * Resolve a category for a user, creating it if it does not exist.
 * If the name matches a canonical entry in any language, the canonical key is
 * used as the DB name so cross-language references converge to a single row.
 * This makes "transport"/"транспорт"/"transport" all resolve to the same row.
 */
export async function resolveOrCreateCategory(
  userId: string,
  name: string,
  type: TxType
): Promise<string> {
  const txTypeStr = type === TxType.income ? "income" : "expense";
  const canonical = findCanonical(name, txTypeStr);
  const normalizedName = canonical ? canonical.key : name.toLowerCase().trim();

  const prisma = db as import("@prisma/client").PrismaClient;
  const existing = await prisma.category.findUnique({
    where: { userId_name_type: { userId, name: normalizedName, type } },
  });
  if (existing) return existing.id;

  const created = await prisma.category.create({
    data: {
      userId,
      name: normalizedName,
      type,
      emoji: canonical?.emoji ?? null,
      isDefault: canonical !== undefined,
    },
  });
  return created.id;
}

/**
 * Return the user's categories of `type`, ranked by usage count (most used first),
 * with a +1000 score boost when `hint` substring-matches the category name
 * (either direction, case-insensitive). Returns top `limit` {id, name} pairs.
 */
export async function getSmartCategories(
  userId: string,
  type: TxType,
  hint?: string | null,
  limit = 5
): Promise<{ id: string; name: string }[]> {
  const prisma = db as import("@prisma/client").PrismaClient;

  // Fetch all categories of this type for the user
  const cats = await prisma.category.findMany({
    where: { userId, type },
    select: { id: true, name: true },
  });

  if (cats.length === 0) return [];

  // Usage counts: group transactions by categoryId
  const groups = await prisma.transaction.groupBy({
    by: ["categoryId"],
    where: { userId, type, deletedAt: null, categoryId: { not: null } },
    _count: { _all: true },
  });
  const usageMap = new Map<string, number>();
  for (const g of groups) {
    if (g.categoryId) usageMap.set(g.categoryId, g._count._all);
  }

  // Score each category
  const hintLower = hint ? hint.toLowerCase() : null;
  const scored = cats.map((c) => {
    const nameLower = c.name.toLowerCase();
    let score = usageMap.get(c.id) ?? 0;
    if (hintLower && (nameLower.includes(hintLower) || hintLower.includes(nameLower))) {
      score += 1000;
    }
    return { ...c, score };
  });

  // Sort by score desc, then name asc
  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  return scored.slice(0, limit).map(({ id, name }) => ({ id, name }));
}
