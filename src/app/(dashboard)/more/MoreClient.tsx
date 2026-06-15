"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LangSwitcher } from "@/components/LangSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { LangCode } from "@/lib/i18n/translate";
import { t } from "@/lib/i18n/translate";

type DisplayCurrency = "UZS" | "USD" | "EUR" | "RUB";

interface MoreClientProps {
  lang: LangCode;
  displayCurrency: DisplayCurrency;
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

function IconCurrency() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M9 8h5a2 2 0 0 1 0 4H9v4h7" />
      <path d="M12 6v2M12 16v2" />
    </svg>
  );
}

function IconLanguage() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function IconConverter() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      <path d="M7 9l-3 3 3 3M17 9l3 3-3 3" />
    </svg>
  );
}

function IconTheme() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

/** Right-side chevron that rotates down when its row is open. */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        color: "var(--fg-subtle)",
        transform: open ? "rotate(90deg)" : "none",
        transition: "transform var(--dur-base, 180ms) var(--ease-out, ease)",
      }}
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

const LANG_LABELS: Record<LangCode, string> = {
  uz: "O'zbek",
  ru: "Русский",
  en: "English",
};

/** Currency labels in three languages */
const CURRENCY_LABELS: Record<DisplayCurrency, Record<LangCode, string>> = {
  UZS: { uz: "So'm (UZS)", ru: "Сум (UZS)", en: "So'm (UZS)" },
  USD: { uz: "Dollar (USD)", ru: "Доллар (USD)", en: "Dollar (USD)" },
  EUR: { uz: "Evro (EUR)", ru: "Евро (EUR)", en: "Euro (EUR)" },
  RUB: { uz: "Rubl (RUB)", ru: "Рубль (RUB)", en: "Ruble (RUB)" },
};

type RowKey = "currency" | "lang" | "theme";

export function MoreClient({ lang, displayCurrency: initialCurrency }: MoreClientProps) {
  const router = useRouter();
  // Accordion: only one row's options open at a time.
  const [open, setOpen] = useState<RowKey | null>(null);
  const toggle = (k: RowKey) => setOpen((cur) => (cur === k ? null : k));

  const [currency, setCurrency] = useState<DisplayCurrency>(initialCurrency);
  const [currencyLoading, setCurrencyLoading] = useState(false);
  const [currencyError, setCurrencyError] = useState<string | null>(null);

  const handleCurrencySelect = async (cur: DisplayCurrency) => {
    if (cur === currency) {
      setOpen(null);
      return;
    }
    setCurrencyLoading(true);
    setCurrencyError(null);
    try {
      const res = await fetch("/api/currency", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency: cur }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setCurrency(cur);
      setOpen(null);
      router.refresh();
    } catch {
      setCurrencyError(
        lang === "ru"
          ? "Ошибка сохранения"
          : lang === "en"
          ? "Save failed"
          : "Saqlash muvaffaqiyatsiz"
      );
    } finally {
      setCurrencyLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore fetch errors — redirect anyway
    }
    window.location.href = "/login";
  };

  const rowClass =
    "w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[var(--surface-sunken)] focus-visible:outline-none";

  const CURRENCIES: DisplayCurrency[] = ["UZS", "USD", "EUR", "RUB"];

  return (
    <>
      {/* Settings card — tap a row to reveal its options */}
      <div
        style={{
          background: "var(--surface-elevated)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        {/* Bosh valyuta (Main currency) */}
        <div>
          <button
            type="button"
            onClick={() => toggle("currency")}
            className={rowClass}
            style={{ minHeight: 56, background: "transparent" }}
            aria-expanded={open === "currency"}
            aria-label={`${t("more.currency", lang)}: ${currency}`}
          >
            <IconTile bg="var(--surface-sunken)" color="var(--fg-muted)">
              <IconCurrency />
            </IconTile>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                {t("more.currency", lang)}
              </div>
              <div className="text-xs" style={{ color: "var(--fg-subtle)" }}>
                {t("more.currency_sub", lang)}
              </div>
            </div>
            <span className="text-sm mr-1 tabular" style={{ color: "var(--fg-muted)" }}>
              {currency}
            </span>
            <Chevron open={open === "currency"} />
          </button>
          {open === "currency" && (
            <div className="px-4 pb-4 pt-1 space-y-2">
              {currencyError && (
                <p className="text-xs" style={{ color: "var(--expense)" }}>
                  {currencyError}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {CURRENCIES.map((cur) => (
                  <button
                    key={cur}
                    type="button"
                    disabled={currencyLoading}
                    onClick={() => handleCurrencySelect(cur)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-60"
                    style={
                      cur === currency
                        ? { background: "var(--accent-gradient)", color: "#fff", boxShadow: "var(--shadow-sm)" }
                        : {
                            background: "var(--surface-sunken)",
                            color: "var(--fg-muted)",
                            border: "1px solid var(--border)",
                          }
                    }
                  >
                    {CURRENCY_LABELS[cur][lang]}
                  </button>
                ))}
              </div>
              <p className="text-xs pt-1" style={{ color: "var(--fg-subtle)" }}>
                {t("more.currency_cbu_note", lang)}
              </p>
            </div>
          )}
        </div>

        {/* Valyuta kursi (Converter) */}
        <div style={{ borderTop: "1px solid var(--border)" }}>
          <Link
            href="/converter"
            className={rowClass}
            style={{ minHeight: 56, display: "flex", textDecoration: "none" }}
          >
            <IconTile bg="var(--surface-sunken)" color="var(--fg-muted)">
              <IconConverter />
            </IconTile>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                {t("more.converter", lang)}
              </div>
              <div className="text-xs" style={{ color: "var(--fg-subtle)" }}>
                {t("more.converter_sub", lang)}
              </div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--fg-subtle)", flexShrink: 0 }}>
              <path d="M9 18l6-6-6-6" />
            </svg>
          </Link>
        </div>

        {/* Til (Language) */}
        <div style={{ borderTop: "1px solid var(--border)" }}>
          <button
            type="button"
            onClick={() => toggle("lang")}
            className={rowClass}
            style={{ minHeight: 56, background: "transparent" }}
            aria-expanded={open === "lang"}
            aria-label={`${t("more.language", lang)}: ${LANG_LABELS[lang]}`}
          >
            <IconTile bg="var(--surface-sunken)" color="var(--fg-muted)">
              <IconLanguage />
            </IconTile>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                {t("more.language", lang)}
              </div>
              <div className="text-xs" style={{ color: "var(--fg-subtle)" }}>
                {t("more.language_sub", lang)}
              </div>
            </div>
            <span className="text-sm mr-1" style={{ color: "var(--fg-muted)" }}>
              {LANG_LABELS[lang]}
            </span>
            <Chevron open={open === "lang"} />
          </button>
          {open === "lang" && (
            <div className="px-4 pb-4 pt-1">
              <LangSwitcher currentLang={lang} />
            </div>
          )}
        </div>

        {/* Mavzu (Theme) */}
        <div style={{ borderTop: "1px solid var(--border)" }}>
          <button
            type="button"
            onClick={() => toggle("theme")}
            className={rowClass}
            style={{ minHeight: 56, background: "transparent" }}
            aria-expanded={open === "theme"}
            aria-label={t("nav.theme", lang)}
          >
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
            <Chevron open={open === "theme"} />
          </button>
          {open === "theme" && (
            <div className="px-4 pb-4 pt-1">
              <ThemeToggle lang={lang} />
            </div>
          )}
        </div>
      </div>

      {/* Chiqish (Logout) */}
      <button
        onClick={handleLogout}
        className="w-full py-3.5 text-sm font-semibold transition-colors active:opacity-80"
        style={{
          background: "var(--expense-wash)",
          color: "var(--expense)",
          border: "none",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        {t("nav.logout", lang)}
      </button>
    </>
  );
}
