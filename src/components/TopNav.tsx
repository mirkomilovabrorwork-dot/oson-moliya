"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LangSwitcher } from "@/components/LangSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { LangCode } from "@/lib/i18n/translate";
import { t } from "@/lib/i18n/translate";
interface TopNavProps {
  lang: LangCode;
}

export function TopNav({ lang }: TopNavProps) {
  const pathname = usePathname();

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

          {/* Right side */}
          <div className="flex items-center gap-3">
            <ThemeToggle lang={lang} />
            <LangSwitcher currentLang={lang} />
            <button
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                location.href = "/login";
              }}
              className="hidden sm:block text-sm transition-colors"
              style={{ color: "var(--fg-subtle)" }}
            >
              {t("nav.logout", lang)}
            </button>
            {/* Mobile hamburger — hidden on mobile (BottomNav handles nav there) */}
          </div>
        </div>
      </div>
    </header>
  );
}
