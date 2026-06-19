"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { t, type LangCode } from "@/lib/i18n/translate";

const STORAGE_KEY = "pultrack_budget_nudge_dismissed";

interface BudgetNudgeProps {
  /** Whether the server determined no expense budget is set */
  show: boolean;
  lang: LangCode;
}

/**
 * Soft, dismissible amber nudge shown on Home when no expense budget is set.
 * - Reads localStorage on mount to avoid hydration flash (starts hidden).
 * - On ✕ click: persists dismissal to localStorage and hides permanently.
 * - Does NOT affect the existing Diqqat over-budget alert.
 */
export function BudgetNudge({ show, lang }: BudgetNudgeProps) {
  // Start hidden to avoid hydration mismatch; reveal after reading localStorage.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!show) return;
    try {
      const dismissed = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is unavailable during SSR; must read client-side to avoid hydration mismatch
      if (!dismissed) setVisible(true);
    } catch {
      // localStorage unavailable (e.g. private browsing with restrictions) — stay hidden
    }
  }, [show]);

  function handleDismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="p-4 sm:p-5 rounded-[var(--radius-lg)] relative"
      style={{
        background: "var(--warning-wash)",
        border: "1px solid var(--warning)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {/* Dismiss button — 44px touch target */}
      <button
        onClick={handleDismiss}
        aria-label={lang === "ru" ? "Закрыть" : lang === "en" ? "Close" : "Yopish"}
        className="absolute top-2 right-2 flex items-center justify-center rounded-lg transition-opacity hover:opacity-70"
        style={{
          width: 44,
          height: 44,
          color: "var(--warning)",
          background: "transparent",
          border: "none",
          cursor: "pointer",
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <line x1="1" y1="1" x2="13" y2="13" />
          <line x1="13" y1="1" x2="1" y2="13" />
        </svg>
      </button>

      <div className="flex items-start gap-3 pr-10">
        {/* Info icon */}
        <span
          className="shrink-0 mt-0.5 w-8 h-8 rounded-[10px] flex items-center justify-center"
          style={{ background: "var(--warning)", color: "var(--warning-fg)" }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-sm leading-snug" style={{ color: "var(--fg)" }}>
            {t("home.budget_nudge", lang)}
          </p>
          <Link
            href="/categories"
            className="inline-block mt-1.5 text-xs font-semibold"
            style={{ color: "var(--warning)" }}
          >
            {t("home.budget_nudge_cta", lang)}
          </Link>
        </div>
      </div>
    </div>
  );
}
