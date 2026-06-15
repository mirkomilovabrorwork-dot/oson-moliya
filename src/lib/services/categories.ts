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
