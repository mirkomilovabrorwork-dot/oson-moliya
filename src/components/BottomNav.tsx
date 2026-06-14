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
      {/* Hand holding coins */}
      <path d="M20 12c0 1.1-.9 2-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4z"/>
      <circle cx="10" cy="10" r="1.5"/>
      <circle cx="14" cy="10" r="1.5"/>
      <path d="M4 14c0 2.2 1.8 4 4 4h8c2.2 0 4-1.8 4-4"/>
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
