"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { LangCode } from "@/lib/i18n/translate";
import { t } from "@/lib/i18n/translate";
import { QuickAddForm } from "@/components/QuickAddForm";

type SupportedCurrency = "UZS" | "USD" | "EUR" | "RUB";

interface AddSheetProps {
  lang: LangCode;
  mainCurrency?: SupportedCurrency;
}

interface CategoryRaw {
  id: string;
  name: string;
  type: string;
  emoji: string | null;
}

export function AddSheet({ lang, mainCurrency = "UZS" }: AddSheetProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<CategoryRaw[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Lazy-load categories on first open
  useEffect(() => {
    if (!open || categories !== null) return;
    void Promise.resolve()
      .then(() => {
        setLoading(true);
        return fetch("/api/categories");
      })
      .then((r) => r.json())
      .then((data: CategoryRaw[]) => {
        setCategories(
          data.map((c) => ({
            ...c,
            type: c.type.toLowerCase(),
            emoji: c.emoji ?? null,
          }))
        );
      })
      .catch(() => setCategories([]))
      .finally(() => setLoading(false));
  }, [open, categories]);

  // When the sheet opens, push a history entry so device/Telegram back closes it.
  // On programmatic close (X / backdrop / success), call history.back() only if
  // the pushed state is still on top — keeps the history stack consistent.
  const close = useCallback(() => {
    setOpen(false);
    if (typeof window !== "undefined" && window.history.state?.addSheet) {
      window.history.back();
    }
  }, []);

  // Push history state when opening; register popstate so back-button closes the sheet.
  useEffect(() => {
    if (!open) return;
    if (typeof window !== "undefined") {
      window.history.pushState({ addSheet: true }, "");
    }
    const onPop = () => setOpen(false);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open]);

  // Close on Esc
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, close]);

  return (
    <>
      {/* FAB — mobile: above bottom nav; sm+: bottom-8 right-8 */}
      <style>{`
        .add-sheet-fab {
          bottom: calc(env(safe-area-inset-bottom, 0px) + 92px);
          right: 1.35rem;
        }
        @media (min-width: 640px) {
          .add-sheet-fab {
            bottom: 2rem;
            right: 2rem;
          }
        }
      `}</style>
      <button
        aria-label={t("overview.quick_add", lang)}
        onClick={() => setOpen(true)}
        className="add-sheet-fab fixed z-50 flex items-center justify-center w-14 h-14 rounded-full transition-transform active:scale-95"
        style={{
          background: "var(--accent-gradient)",
          color: "#ffffff",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14"/>
        </svg>
      </button>

      {/* Sheet overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center"
          style={{ background: "rgba(0,0,0,.5)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            className="w-full sm:max-w-md sm:mx-4 flex flex-col"
            style={{
              background: "var(--surface)",
              borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-lg)",
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
              maxHeight: "90dvh",
              overflowY: "auto",
            }}
          >
            <div className="flex justify-center pt-2">
              <span
                className="h-1 w-12 rounded-full"
                style={{ background: "var(--border-strong)" }}
              />
            </div>
            {/* Sheet header */}
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <span className="text-sm font-semibold" style={{ color: "var(--fg)" }}>
                {t("overview.quick_add", lang)}
              </span>
              <button
                onClick={close}
                className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
                style={{ color: "var(--fg-subtle)", background: "var(--surface-sunken)" }}
                aria-label={t("common.close", lang)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="p-4">
              {loading || categories === null ? (
                <div
                  className="py-10 text-center text-sm"
                  style={{ color: "var(--fg-subtle)" }}
                >
                  {t("common.loading", lang)}
                </div>
              ) : (
                <QuickAddForm
                  bare
                  lang={lang}
                  categories={categories}
                  mainCurrency={mainCurrency}
                  onSuccess={() => {
                    close();
                    router.refresh();
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
