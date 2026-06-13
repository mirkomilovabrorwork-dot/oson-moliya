"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LangCode } from "@/lib/i18n/translate";
import { t } from "@/lib/i18n/translate";

interface BottomNavProps {
  lang: LangCode;
}

// Minimal SVG icons — no external deps
function IconHome() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/>
      <path d="M9 21V12h6v9"/>
    </svg>
  );
}

function IconTransactions() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 7l4-4 4 4"/>
      <path d="M12 3v10"/>
      <path d="M16 17l-4 4-4-4"/>
      <path d="M12 21V11"/>
    </svg>
  );
}

function IconAnalytics() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="12" width="4" height="9" rx="1"/>
      <rect x="10" y="7" width="4" height="14" rx="1"/>
      <rect x="17" y="3" width="4" height="18" rx="1"/>
    </svg>
  );
}

function IconCategories() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5"/>
      <rect x="14" y="3" width="7" height="7" rx="1.5"/>
      <rect x="3" y="14" width="7" height="7" rx="1.5"/>
      <rect x="14" y="14" width="7" height="7" rx="1.5"/>
    </svg>
  );
}

const tabs = [
  { href: "/", labelKey: "nav.overview", Icon: IconHome },
  { href: "/transactions", labelKey: "nav.transactions", Icon: IconTransactions },
  { href: "/analytics", labelKey: "nav.analytics", Icon: IconAnalytics },
  { href: "/categories", labelKey: "nav.categories", Icon: IconCategories },
] as const;

export function BottomNav({ lang }: BottomNavProps) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav
      className="sm:hidden fixed bottom-0 inset-x-0 z-40 flex items-stretch"
      style={{
        background: "var(--surface)",
        borderTop: "1px solid var(--border)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
      aria-label="bottom-nav"
    >
      {tabs.map(({ href, labelKey, Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors"
            style={{
              color: active ? "var(--accent)" : "var(--fg-subtle)",
              minHeight: 56,
            }}
          >
            <span
              className="flex items-center justify-center w-7 h-7 rounded-xl transition-colors"
              style={active ? { background: "var(--accent-wash)" } : {}}
            >
              <Icon />
            </span>
            <span className="leading-none tracking-tight">
              {t(labelKey, lang)}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
