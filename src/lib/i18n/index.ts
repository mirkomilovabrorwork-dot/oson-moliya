/**
 * i18n entry point.
 * - `t()` and `LangCode` are in translate.ts (safe for client components)
 * - `resolveLang()` uses next/headers (server-only)
 */
export { t, type LangCode } from "./translate";

import { cookies } from "next/headers";
import type { LangCode } from "./translate";

const LANG_COOKIE = "pultrack_lang";
const DEFAULT_LANG: LangCode = "uz";

/**
 * Resolves the current language from:
 * 1. pultrack_lang cookie
 * 2. User.language passed in
 * 3. Default "uz"
 *
 * SERVER-ONLY — uses next/headers cookies().
 */
export async function resolveLang(userLang?: string): Promise<LangCode> {
  try {
    const cookieStore = await cookies();
    const cookieLang = cookieStore.get(LANG_COOKIE)?.value;
    if (cookieLang && isValidLang(cookieLang)) return cookieLang as LangCode;
  } catch {
    // cookies() might throw during build
  }

  if (userLang && isValidLang(userLang)) return userLang as LangCode;
  return DEFAULT_LANG;
}

function isValidLang(lang: string): lang is LangCode {
  return lang === "uz" || lang === "ru" || lang === "en";
}
