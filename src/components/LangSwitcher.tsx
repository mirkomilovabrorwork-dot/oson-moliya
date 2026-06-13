"use client";

import { useRouter } from "next/navigation";
import type { LangCode } from "@/lib/i18n/translate";

const LANG_COOKIE = "pultrack_lang";

const LANGS: { code: LangCode; label: string }[] = [
  { code: "uz", label: "UZ" },
  { code: "ru", label: "RU" },
  { code: "en", label: "EN" },
];

interface LangSwitcherProps {
  currentLang: LangCode;
}

export function LangSwitcher({ currentLang }: LangSwitcherProps) {
  const router = useRouter();

  const handleChange = (lang: LangCode) => {
    document.cookie = `${LANG_COOKIE}=${lang};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
    router.refresh();
  };

  return (
    <div
      className="flex rounded-lg overflow-hidden text-xs font-semibold"
      style={{ border: "1px solid var(--border)" }}
      role="group"
      aria-label="Language"
    >
      {LANGS.map(({ code, label }, i) => (
        <button
          key={code}
          onClick={() => handleChange(code)}
          className="px-2.5 py-1 transition-all focus-visible:outline-none focus-visible:ring-2"
          style={
            currentLang === code
              ? {
                  background: "var(--accent)",
                  color: "var(--accent-fg)",
                  borderRight:
                    i < LANGS.length - 1
                      ? "1px solid var(--accent-hover)"
                      : undefined,
                }
              : {
                  background: "var(--surface)",
                  color: "var(--fg-muted)",
                  borderRight:
                    i < LANGS.length - 1
                      ? "1px solid var(--border)"
                      : undefined,
                }
          }
          aria-pressed={currentLang === code}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
