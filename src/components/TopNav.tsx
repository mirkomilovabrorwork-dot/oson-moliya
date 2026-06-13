"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LangSwitcher } from "@/components/LangSwitcher";
import type { LangCode } from "@/lib/i18n/translate";
import { t } from "@/lib/i18n/translate";
import { useState } from "react";

interface TopNavProps {
  lang: LangCode;
}

export function TopNav({ lang }: TopNavProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = [
    { href: "/", label: t("nav.overview", lang) },
    { href: "/transactions", label: t("nav.transactions", lang) },
    { href: "/analytics", label: t("nav.analytics", lang) },
    { href: "/categories", label: t("nav.categories", lang) },
  ];

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header
      className="bg-white border-b sticky top-0 z-30"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
    >
      <div className="max-w-5xl mx-auto px-4">
        <div className="h-14 flex items-center justify-between">
          {/* Brand + desktop nav */}
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="font-bold text-lg"
              style={{ color: "var(--color-brand)" }}
            >
              PulTrack
            </Link>
            <nav className="hidden sm:flex items-center gap-1" aria-label="main-nav">
              {navLinks.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                  style={
                    isActive(href)
                      ? { color: "var(--color-brand)", background: "var(--color-brand-light)" }
                      : { color: "var(--color-text-secondary)" }
                  }
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <LangSwitcher currentLang={lang} />
            <Link
              href="/api/auth/logout"
              className="hidden sm:block text-sm transition-colors"
              style={{ color: "var(--color-text-muted)" }}
            >
              {t("nav.logout", lang)}
            </Link>
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="sm:hidden p-2 rounded-lg"
              style={{ color: "var(--color-text-secondary)" }}
              aria-label="menu"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                {mobileOpen ? (
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                ) : (
                  <path
                    fillRule="evenodd"
                    d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                    clipRule="evenodd"
                  />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div
          className="sm:hidden border-t px-4 py-3 space-y-1"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
        >
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className="block px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
              style={
                isActive(href)
                  ? { color: "var(--color-brand)", background: "var(--color-brand-light)" }
                  : { color: "var(--color-text-secondary)" }
              }
            >
              {label}
            </Link>
          ))}
          <Link
            href="/api/auth/logout"
            className="block px-3 py-2.5 text-sm"
            style={{ color: "var(--color-text-muted)" }}
          >
            {t("nav.logout", lang)}
          </Link>
        </div>
      )}
    </header>
  );
}
