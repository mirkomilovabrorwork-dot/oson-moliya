"use client";

import { LangSwitcher } from "@/components/LangSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { LangCode } from "@/lib/i18n/translate";
import { t } from "@/lib/i18n/translate";

interface MoreClientProps {
  lang: LangCode;
}

function IconTile({
  bg,
  color,
  children,
}: {
  bg: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className="flex-shrink-0 w-9 h-9 rounded-[12px] flex items-center justify-center"
      style={{ background: bg, color }}
    >
      {children}
    </span>
  );
}

function IconLanguage() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  );
}

function IconTheme() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
    </svg>
  );
}

const LANG_LABELS: Record<LangCode, string> = {
  uz: "O'zbek",
  ru: "Русский",
  en: "English",
};

export function MoreClient({ lang }: MoreClientProps) {
  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore fetch errors — redirect anyway
    }
    window.location.href = "/login";
  };

  return (
    <>
      {/* Second card: Til (Language) + Mavzu (Theme) with inline interactive controls */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
        }}
      >
        {/* Row 4: Til (Language) */}
        <div>
          <div className="flex items-center gap-3 px-4 py-3.5" style={{ minHeight: 56 }}>
            <IconTile bg="var(--accent-wash)" color="var(--accent)">
              <IconLanguage />
            </IconTile>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                {t("more.language", lang)}
              </div>
              <div className="text-xs" style={{ color: "var(--fg-subtle)" }}>
                {LANG_LABELS[lang]}
              </div>
            </div>
          </div>
          {/* LangSwitcher inline below the row label */}
          <div className="px-4 pb-3">
            <LangSwitcher currentLang={lang} />
          </div>
        </div>

        {/* Row 5: Mavzu (Theme) */}
        <div style={{ borderTop: "1px solid var(--border)" }}>
          <div className="flex items-center gap-3 px-4 py-3.5" style={{ minHeight: 56 }}>
            <IconTile bg="var(--surface-sunken)" color="var(--fg-muted)">
              <IconTheme />
            </IconTile>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                {t("nav.theme", lang)}
              </div>
              <div className="text-xs" style={{ color: "var(--fg-subtle)" }}>
                {t("more.theme_sub", lang)}
              </div>
            </div>
          </div>
          {/* ThemeToggle inline below the row label */}
          <div className="px-4 pb-3">
            <ThemeToggle lang={lang} />
          </div>
        </div>
      </div>

      {/* Chiqish (Logout) button — below both cards */}
      <button
        onClick={handleLogout}
        className="w-full py-3.5 text-sm font-semibold transition-colors active:opacity-80"
        style={{
          background: "var(--expense-wash)",
          color: "var(--expense)",
          border: "none",
          borderRadius: "var(--radius-lg)",
        }}
      >
        {t("nav.logout", lang)}
      </button>
    </>
  );
}
