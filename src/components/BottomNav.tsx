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
      {/* Receipt — clearly "transactions / records" */}
      <path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z"/>
      <path d="M9.5 8h5"/>
      <path d="M9.5 12h5"/>
    </svg>
  );
}

function IconDebts() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {/* Ledger / notebook (qarz daftari) — margin line + ruled rows */}
      <rect x="4" y="3" width="16" height="18" rx="2"/>
      <path d="M9 3v18"/>
      <path d="M12.5 8h4"/>
      <path d="M12.5 12h4"/>
      <path d="M12.5 16h4"/>
    </svg>
  );
}

function IconMore() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {/* Three dots horizontal */}
      <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/>
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>
      <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/>
    </svg>
  );
}

const tabs = [
  { href: "/", labelKey: "nav.home", Icon: IconHome },
  { href: "/transactions", labelKey: "nav.transactions", Icon: IconTransactions },
  { href: "/debts", labelKey: "nav.debts", Icon: IconDebts },
  { href: "/more", labelKey: "nav.more", Icon: IconMore },
] as const;

export function BottomNav({ lang }: BottomNavProps) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav
      className="sm:hidden fixed left-3 right-3 z-40 grid grid-cols-4 items-stretch"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 10px)",
        background: "var(--surface-elevated)",
        border: "1px solid var(--border)",
        borderRadius: 22,
        boxShadow: "var(--shadow-md)",
        minHeight: 72,
        backdropFilter: "blur(18px)",
      }}
      aria-label="bottom-nav"
    >
      {tabs.map(({ href, labelKey, Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-semibold transition-colors"
            style={{
              color: active ? "var(--accent)" : "var(--fg-subtle)",
              minHeight: 56,
            }}
          >
            <span
              className="flex items-center justify-center w-7 h-7 rounded-xl transition-colors"
              style={active ? { background: "var(--accent-wash)", boxShadow: "var(--shadow-sm)" } : {}}
            >
              <Icon />
            </span>
            <span className="leading-none">
              {t(labelKey, lang)}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
