"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LangCode } from "@/lib/i18n/translate";
import { t } from "@/lib/i18n/translate";

interface TopNavProps {
  lang: LangCode;
}

export function TopNav({ lang }: TopNavProps) {
  const pathname = usePathname();

  const navLinks = [
    { href: "/", label: t("nav.home", lang) },
    { href: "/transactions", label: t("nav.transactions", lang) },
    { href: "/debts", label: t("nav.debts", lang) },
    { href: "/more", label: t("nav.more", lang) },
  ];

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header
      className="sticky top-0 z-30"
      style={{
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div className="max-w-5xl mx-auto px-5 sm:px-8">
        <div className="h-14 flex items-center justify-between">
          {/* Brand + desktop nav */}
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="font-semibold text-base"
              style={{ color: "var(--fg)" }}
            >
              Oson Moliya
            </Link>
            <nav className="hidden sm:flex items-center gap-1" aria-label="main-nav">
              {navLinks.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                  style={
                    isActive(href)
                      ? { color: "var(--accent)", background: "var(--accent-wash)" }
                      : { color: "var(--fg-muted)" }
                  }
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </div>
    </header>
  );
}
