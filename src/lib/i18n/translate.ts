/**
 * Pure translation function — no Next.js dependencies.
 * Safe to import in both Server and Client Components.
 */
import { dictionaries, type LangCode } from "./dictionaries";

export { type LangCode };

export function t(key: string, lang: LangCode = "uz"): string {
  return (
    dictionaries[lang]?.[key] ??
    dictionaries.uz[key] ??
    dictionaries.en[key] ??
    key
  );
}
