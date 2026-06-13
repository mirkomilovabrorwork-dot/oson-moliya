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
    document.cookie = `${LANG_COOKIE}=${lang};path=/;max-age=${60 * 60 * 24 * 365}`;
    router.refresh();
  };

  return (
    <div className="flex gap-1 text-sm">
      {LANGS.map(({ code, label }) => (
        <button
          key={code}
          onClick={() => handleChange(code)}
          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
            currentLang === code
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
