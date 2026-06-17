/**
 * Pure, client-safe category translation helpers.
 * No DB or Node.js dependencies — safe to import in React client components.
 *
 * B3: translateCategoryName — display-layer translation for default categories.
 */

export interface CanonicalCategoryDef {
  key: string;
  type: "income" | "expense";
  uz: string;
  ru: string;
  en: string;
  emoji: string;
}

/**
 * Canonical default-category definitions (mirrors CANONICAL_CATEGORIES in
 * src/lib/services/categories.ts — kept in sync manually).
 * Client components import from here; server code imports from services/categories.ts.
 */
export const CANONICAL_CATEGORY_DEFS: CanonicalCategoryDef[] = [
  // Income
  { key: "sotuv",         type: "income",  uz: "sotuv",         ru: "продажа",           en: "sales",           emoji: "💰" },
  { key: "xizmat",        type: "income",  uz: "xizmat",        ru: "услуга",            en: "service",         emoji: "🛠" },
  { key: "maosh",         type: "income",  uz: "maosh",         ru: "оклад",             en: "wage",            emoji: "💼" },
  { key: "boshqa kirim",  type: "income",  uz: "boshqa kirim",  ru: "прочий доход",      en: "other income",    emoji: "➕" },
  // Expense
  { key: "oziq-ovqat",         type: "expense", uz: "oziq-ovqat",         ru: "продукты",           en: "food",                emoji: "🍽" },
  { key: "logistika",          type: "expense", uz: "logistika",          ru: "логистика",           en: "logistics",           emoji: "🚚" },
  { key: "ijara",              type: "expense", uz: "ijara",              ru: "аренда",              en: "rent",                emoji: "🏠" },
  { key: "oylik",              type: "expense", uz: "oylik",              ru: "зарплата",            en: "salary",              emoji: "👥" },
  { key: "marketing",          type: "expense", uz: "marketing",          ru: "маркетинг",           en: "marketing",           emoji: "📣" },
  { key: "soliq",              type: "expense", uz: "soliq",              ru: "налог",               en: "tax",                 emoji: "🧾" },
  { key: "kommunal",           type: "expense", uz: "kommunal",           ru: "коммунальные",        en: "utilities",           emoji: "💡" },
  { key: "transport",          type: "expense", uz: "transport",          ru: "транспорт",           en: "transport",           emoji: "🚕" },
  { key: "mahsulot",           type: "expense", uz: "mahsulot",           ru: "товар",               en: "goods",               emoji: "📦" },
  { key: "boshqa chiqim",      type: "expense", uz: "boshqa chiqim",      ru: "прочий расход",       en: "other expense",       emoji: "➖" },
  // Uzbek-SMB enrichment
  { key: "mobil aloqa",        type: "expense", uz: "mobil aloqa",        ru: "мобильная связь",     en: "mobile",              emoji: "📱" },
  { key: "internet",           type: "expense", uz: "internet",           ru: "интернет",            en: "internet",            emoji: "🌐" },
  { key: "taksi",              type: "expense", uz: "taksi",              ru: "такси",               en: "taxi",                emoji: "🚖" },
  { key: "dori-darmon",        type: "expense", uz: "dori-darmon",        ru: "лекарства",           en: "medicine",            emoji: "💊" },
  { key: "ta'lim",             type: "expense", uz: "ta'lim",             ru: "образование",         en: "education",           emoji: "🎓" },
  { key: "mehmondorchilik",    type: "expense", uz: "mehmondorchilik",    ru: "угощение",            en: "hospitality",         emoji: "🤝" },
  { key: "kiyim",              type: "expense", uz: "kiyim",              ru: "одежда",              en: "clothing",            emoji: "👕" },
  { key: "sovg'a",             type: "expense", uz: "sovg'a",             ru: "подарок",             en: "gift",                emoji: "🎁" },
  { key: "dam olish",          type: "expense", uz: "dam olish",          ru: "отдых",               en: "leisure",             emoji: "🏖" },
  { key: "benzin",             type: "expense", uz: "benzin",             ru: "бензин",              en: "fuel",                emoji: "⛽" },
  { key: "uy-ro'zg'or",        type: "expense", uz: "uy-ro'zg'or",        ru: "хозтовары",           en: "household",           emoji: "🏡" },
  { key: "bank/komissiya",     type: "expense", uz: "bank/komissiya",     ru: "банк/комиссия",       en: "bank/fees",           emoji: "🏦" },
];

// Pre-built lookup: any variant (uz/ru/en, lower-cased) → CanonicalCategoryDef
const _variantMap = new Map<string, CanonicalCategoryDef>();
for (const cat of CANONICAL_CATEGORY_DEFS) {
  for (const v of [cat.uz, cat.ru, cat.en, cat.key]) {
    if (v) _variantMap.set(v.toLowerCase().trim(), cat);
  }
}

/**
 * Translate a category name for display.
 * Matches against any language variant of every canonical default.
 * Custom (user-created) categories fall through unchanged.
 */
export function translateCategoryName(
  name: string | null | undefined,
  lang: "uz" | "ru" | "en"
): string {
  if (!name) return name ?? "";
  const match = _variantMap.get(name.toLowerCase().trim());
  if (!match) return name;
  return match[lang] ?? name;
}
