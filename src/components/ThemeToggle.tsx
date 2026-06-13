"use client";

import { useEffect, useState } from "react";
import type { LangCode } from "@/lib/i18n/translate";
import { t } from "@/lib/i18n/translate";

type ThemePref = "light" | "dark" | "system";

const THEME_KEY = "pultrack_theme";

function applyTheme(pref: ThemePref) {
  if (pref === "dark") {
    document.documentElement.dataset.theme = "dark";
  } else if (pref === "light") {
    document.documentElement.dataset.theme = "light";
  } else {
    // system
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }
}

interface ThemeToggleProps {
  lang: LangCode;
}

const OPTIONS: { value: ThemePref; labelKey: string }[] = [
  { value: "light", labelKey: "theme.light" },
  { value: "dark", labelKey: "theme.dark" },
  { value: "system", labelKey: "theme.system" },
];

export function ThemeToggle({ lang }: ThemeToggleProps) {
  const [pref, setPref] = useState<ThemePref>("system");

  // On mount, read saved pref
  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY) as ThemePref | null;
      if (saved === "light" || saved === "dark" || saved === "system") {
        setPref(saved);
      } else {
        setPref("system");
      }
    } catch {
      // SSR safety
    }
  }, []);

  const handleChange = (next: ThemePref) => {
    setPref(next);
    try {
      if (next === "system") {
        localStorage.removeItem(THEME_KEY);
      } else {
        localStorage.setItem(THEME_KEY, next);
      }
      applyTheme(next);
    } catch {
      // ignore
    }
  };

  return (
    <div
      className="flex rounded-lg overflow-hidden text-xs font-semibold"
      style={{ border: "1px solid var(--color-border)" }}
      role="group"
      aria-label={t("nav.theme", lang)}
    >
      {OPTIONS.map(({ value, labelKey }, i) => (
        <button
          key={value}
          onClick={() => handleChange(value)}
          className="px-2.5 py-1 transition-all focus-visible:outline-none focus-visible:ring-2"
          style={
            pref === value
              ? {
                  background: "var(--color-brand)",
                  color: "#fff",
                  borderRight:
                    i < OPTIONS.length - 1
                      ? "1px solid var(--color-brand-hover)"
                      : undefined,
                }
              : {
                  background: "var(--color-surface)",
                  color: "var(--color-text-secondary)",
                  borderRight:
                    i < OPTIONS.length - 1
                      ? "1px solid var(--color-border)"
                      : undefined,
                }
          }
          aria-pressed={pref === value}
        >
          {t(labelKey, lang)}
        </button>
      ))}
    </div>
  );
}
