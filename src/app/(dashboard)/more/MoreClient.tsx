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
  hasLoginName: boolean;
  currentLoginName: string | null;
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

function IconRecurring() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12a10 10 0 0 1 17.66-6.37M22 4v6h-6M22 12a10 10 0 0 1-17.66 6.37M2 20v-6h6" />
    </svg>
  );
}

function IconLock() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function IconCheckCircle() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
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

export function MoreClient({ lang, displayCurrency: initialCurrency, hasLoginName, currentLoginName }: MoreClientProps) {
  const router = useRouter();
  // Accordion: only one row's options open at a time.
  const [open, setOpen] = useState<RowKey | null>(null);
  const toggle = (k: RowKey) => setOpen((cur) => (cur === k ? null : k));

  const [currency, setCurrency] = useState<DisplayCurrency>(initialCurrency);
  const [currencyLoading, setCurrencyLoading] = useState(false);
  const [currencyError, setCurrencyError] = useState<string | null>(null);

  // Recovery anchor state
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryLoginName, setRecoveryLoginName] = useState(currentLoginName ?? "");
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryPasswordConfirm, setRecoveryPasswordConfirm] = useState("");
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoverySuccess, setRecoverySuccess] = useState(hasLoginName);
  const [recoverySavedLogin, setRecoverySavedLogin] = useState(currentLoginName);
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  const handleRecoverySubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setRecoveryError(null);

    // Client-side validation
    if (!/^[a-z0-9_]{3,20}$/.test(recoveryLoginName)) {
      setRecoveryError(t("recovery.invalid", lang));
      return;
    }
    if (recoveryPassword.length < 8) {
      setRecoveryError(t("recovery.invalid", lang));
      return;
    }
    if (recoveryPassword !== recoveryPasswordConfirm) {
      setRecoveryError(t("recovery.passwords_mismatch", lang));
      return;
    }

    setRecoveryLoading(true);
    try {
      const res = await fetch("/api/auth/set-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginName: recoveryLoginName, password: recoveryPassword }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; loginName?: string };

      if (res.ok && data.ok) {
        setRecoverySuccess(true);
        setRecoverySavedLogin(data.loginName ?? recoveryLoginName);
        setRecoveryOpen(false);
        setRecoveryPassword("");
        setRecoveryPasswordConfirm("");
        return;
      }

      if (res.status === 409) {
        setRecoveryError(t("recovery.login_taken", lang));
      } else if (res.status === 422) {
        setRecoveryError(t("recovery.invalid", lang));
      } else {
        setRecoveryError(t("recovery.invalid", lang));
      }
    } catch {
      setRecoveryError(t("error.generic", lang));
    } finally {
      setRecoveryLoading(false);
    }
  };

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
          : "Saqlash muvaffaqiyatsiz" // uz (explicit fallback for any non-ru/en lang)
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

        {/* Takroriy to'lovlar (Recurring) */}
        <div style={{ borderTop: "1px solid var(--border)" }}>
          <Link
            href="/recurring"
            className={rowClass}
            style={{ minHeight: 56, display: "flex", textDecoration: "none" }}
          >
            <IconTile bg="var(--surface-sunken)" color="var(--fg-muted)">
              <IconRecurring />
            </IconTile>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                {t("more.recurring", lang)}
              </div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--fg-subtle)", flexShrink: 0 }}>
              <path d="M9 18l6-6-6-6" />
            </svg>
          </Link>
        </div>

        {/* O'chirilganlar (Trash) */}
        <div style={{ borderTop: "1px solid var(--border)" }}>
          <Link
            href="/trash"
            className={rowClass}
            style={{ minHeight: 56, display: "flex", textDecoration: "none" }}
          >
            <IconTile bg="var(--surface-sunken)" color="var(--fg-muted)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
            </IconTile>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                {t("more.trash", lang)}
              </div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--fg-subtle)", flexShrink: 0 }}>
              <path d="M9 18l6-6-6-6" />
            </svg>
          </Link>
        </div>

        {/* Ma'lumotlarni yuklab olish (Backup download) */}
        <div style={{ borderTop: "1px solid var(--border)" }}>
          <a
            href="/api/backup"
            download
            className={rowClass}
            style={{ minHeight: 56, display: "flex", textDecoration: "none" }}
          >
            <IconTile bg="var(--surface-sunken)" color="var(--fg-muted)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </IconTile>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                {t("more.backup", lang)}
              </div>
              <div className="text-xs" style={{ color: "var(--fg-subtle)" }}>
                {t("more.backup_sub", lang)}
              </div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--fg-subtle)", flexShrink: 0 }}>
              <path d="M9 18l6-6-6-6" />
            </svg>
          </a>
        </div>

      </div>

      {/* Account protection card */}
      <div
        style={{
          background: "var(--surface-elevated)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        {recoverySuccess && !recoveryOpen ? (
          /* Protected state row */
          <div>
            <button
              type="button"
              onClick={() => setRecoveryOpen(true)}
              className={rowClass}
              style={{ minHeight: 56, background: "transparent" }}
              aria-label={t("recovery.change_password", lang)}
            >
              <IconTile bg="var(--surface-sunken)" color="var(--accent)">
                <IconCheckCircle />
              </IconTile>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                  {t("recovery.saved", lang)} · login: {recoverySavedLogin}
                </div>
                <div className="text-xs" style={{ color: "var(--fg-subtle)" }}>
                  {t("recovery.change_password", lang)}
                </div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--fg-subtle)", flexShrink: 0 }}>
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        ) : recoveryOpen && recoverySuccess ? (
          /* Change password form (login pre-filled, not editable) */
          <div className="px-4 py-4 space-y-3">
            <div className="flex items-center gap-3 mb-1">
              <IconTile bg="var(--surface-sunken)" color="var(--fg-muted)">
                <IconLock />
              </IconTile>
              <span className="text-sm font-semibold" style={{ color: "var(--fg)" }}>
                {t("recovery.change_password", lang)}
              </span>
            </div>
            <form className="space-y-3" onSubmit={handleRecoverySubmit}>
              <div className="space-y-1">
                <label className="block text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--fg-muted)" }}>
                  {t("recovery.login_label", lang)}
                </label>
                <input
                  type="text"
                  value={recoverySavedLogin ?? ""}
                  disabled
                  className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
                  style={{ background: "var(--surface-sunken)", border: "1px solid var(--border)", color: "var(--fg-muted)" }}
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--fg-muted)" }}>
                  {t("recovery.password_label", lang)}
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={recoveryPassword}
                  onChange={(e) => { setRecoveryPassword(e.target.value); setRecoveryError(null); }}
                  className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--fg)" }}
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--fg-muted)" }}>
                  {t("recovery.password_confirm_label", lang)}
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={recoveryPasswordConfirm}
                  onChange={(e) => { setRecoveryPasswordConfirm(e.target.value); setRecoveryError(null); }}
                  className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--fg)" }}
                />
              </div>
              {recoveryError && (
                <p className="text-xs" style={{ color: "var(--expense)" }}>{recoveryError}</p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setRecoveryOpen(false); setRecoveryError(null); setRecoveryPassword(""); setRecoveryPasswordConfirm(""); }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
                  style={{ background: "var(--surface-sunken)", color: "var(--fg-muted)", border: "1px solid var(--border)" }}
                >
                  {t("common.cancel", lang)}
                </button>
                <button
                  type="submit"
                  disabled={recoveryLoading}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-60"
                  style={{ background: "var(--accent-gradient)", color: "#fff", boxShadow: "var(--shadow-sm)" }}
                >
                  {recoveryLoading ? t("recovery.submitting", lang) : t("recovery.save", lang)}
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* Setup form (not yet protected) */
          <div className="px-4 py-4 space-y-3">
            <div className="flex items-center gap-3">
              <IconTile bg="var(--surface-sunken)" color="var(--fg-muted)">
                <IconLock />
              </IconTile>
              <span className="text-sm font-semibold" style={{ color: "var(--fg)" }}>
                {t("recovery.title", lang)}
              </span>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
              {t("recovery.why", lang)}
            </p>
            <form className="space-y-3" onSubmit={handleRecoverySubmit}>
              <div className="space-y-1">
                <label className="block text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--fg-muted)" }}>
                  {t("recovery.login_label", lang)}
                </label>
                <input
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={recoveryLoginName}
                  onChange={(e) => { setRecoveryLoginName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "")); setRecoveryError(null); }}
                  className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--fg)" }}
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--fg-muted)" }}>
                  {t("recovery.password_label", lang)}
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={recoveryPassword}
                  onChange={(e) => { setRecoveryPassword(e.target.value); setRecoveryError(null); }}
                  className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--fg)" }}
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--fg-muted)" }}>
                  {t("recovery.password_confirm_label", lang)}
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={recoveryPasswordConfirm}
                  onChange={(e) => { setRecoveryPasswordConfirm(e.target.value); setRecoveryError(null); }}
                  className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--fg)" }}
                />
              </div>
              {recoveryError && (
                <p className="text-xs" style={{ color: "var(--expense)" }}>{recoveryError}</p>
              )}
              <button
                type="submit"
                disabled={recoveryLoading}
                className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-60"
                style={{ background: "var(--accent-gradient)", color: "#fff", boxShadow: "var(--shadow-sm)" }}
              >
                {recoveryLoading ? t("recovery.submitting", lang) : t("recovery.save", lang)}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Privacy note — builds trust */}
      <p className="text-xs px-1 leading-relaxed" style={{ color: "var(--fg-subtle)" }}>
        🔒 {t("more.privacy_note", lang)}
      </p>

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
