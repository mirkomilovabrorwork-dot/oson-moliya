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
  const [pref, setPref] = useState<ThemePref>("light");

  // On mount, read saved pref
  useEffect(() => {
    void Promise.resolve().then(() => {
      try {
        const saved = localStorage.getItem(THEME_KEY) as ThemePref | null;
        if (saved === "light" || saved === "dark" || saved === "system") {
          setPref(saved);
        } else {
          setPref("light");
        }
      } catch {
        // SSR safety
      }
    });
  }, []);

  const handleChange = (next: ThemePref) => {
    setPref(next);
    try {
      // Persist all prefs (incl. "system") so the no-flash script can resolve them on reload.
      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
    } catch {
      // ignore
    }
  };

  return (
    <div
      className="flex rounded-lg overflow-hidden text-xs font-semibold"
      style={{ border: "1px solid var(--border)" }}
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
                  background: "var(--surface-sunken)",
                  color: "var(--fg)",
                  borderRight:
                    i < OPTIONS.length - 1
                      ? "1px solid var(--border-strong)"
                      : undefined,
                  boxShadow: "var(--shadow-sm)",
                }
              : {
                  background: "var(--surface)",
                  color: "var(--fg-muted)",
                  borderRight:
                    i < OPTIONS.length - 1
                      ? "1px solid var(--border)"
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
