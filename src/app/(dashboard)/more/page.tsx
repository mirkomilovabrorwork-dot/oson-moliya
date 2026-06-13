import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { resolveLang, t } from "@/lib/i18n";
import { TopNav } from "@/components/TopNav";
import { BottomNav } from "@/components/BottomNav";
import { AddSheet } from "@/components/AddSheet";
import { MoreClient } from "./MoreClient";

export const dynamic = "force-dynamic";

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

function IconAccounts() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2"/>
      <path d="M3 10h18"/>
      <circle cx="8" cy="15" r="1.5" fill="currentColor" stroke="none"/>
    </svg>
  );
}

function IconCategories() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="8" height="8" rx="2"/>
      <rect x="13" y="3" width="8" height="8" rx="2"/>
      <rect x="3" y="13" width="8" height="8" rx="2"/>
      <rect x="13" y="13" width="8" height="8" rx="2"/>
    </svg>
  );
}

function IconCurrency() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/>
      <path d="M9 8h5a2 2 0 0 1 0 4H9v4h7"/>
      <path d="M12 6v2M12 16v2"/>
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6"/>
    </svg>
  );
}

export default async function MorePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const lang = await resolveLang(user.language);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <TopNav lang={lang} />
      <BottomNav lang={lang} />
      <AddSheet lang={lang} />

      <main className="max-w-2xl mx-auto px-4 sm:px-8 py-6 pb-28 space-y-5">
        {/* Page heading */}
        <h1
          className="text-xs font-semibold uppercase tracking-wide pl-1"
          style={{ color: "var(--fg-subtle)" }}
        >
          {t("more.title", lang)}
        </h1>

        {/* Settings card — static rows: Hisoblar, Kategoriyalar, Asosiy valyuta */}
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            overflow: "hidden",
          }}
        >
          {/* Row 1: Hisoblar */}
          <Link
            href="/accounts"
            className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--surface-sunken)]"
            style={{ minHeight: 56 }}
          >
            <IconTile bg="var(--income-wash)" color="var(--income)">
              <IconAccounts />
            </IconTile>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                {t("more.accounts", lang)}
              </div>
              <div className="text-xs" style={{ color: "var(--fg-subtle)" }}>
                {t("more.accounts_sub", lang)}
              </div>
            </div>
            <span style={{ color: "var(--fg-subtle)" }}>
              <ChevronRight />
            </span>
          </Link>

          {/* Row 2: Kategoriyalar */}
          <Link
            href="/categories"
            className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--surface-sunken)]"
            style={{ minHeight: 56, borderTop: "1px solid var(--border)" }}
          >
            <IconTile bg="var(--accent-wash)" color="var(--accent)">
              <IconCategories />
            </IconTile>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                {t("nav.categories", lang)}
              </div>
              <div className="text-xs" style={{ color: "var(--fg-subtle)" }}>
                {t("more.categories_sub", lang)}
              </div>
            </div>
            <span style={{ color: "var(--fg-subtle)" }}>
              <ChevronRight />
            </span>
          </Link>

          {/* Row 3: Asosiy valyuta (static, UZS) */}
          <div
            className="flex items-center gap-3 px-4 py-3.5"
            style={{ minHeight: 56, borderTop: "1px solid var(--border)" }}
          >
            <IconTile bg="var(--accent-wash)" color="var(--accent)">
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
            <span className="text-sm mr-1" style={{ color: "var(--fg-muted)" }}>
              UZS
            </span>
            <span style={{ color: "var(--fg-subtle)" }}>
              <ChevronRight />
            </span>
          </div>
        </div>

        {/* Client section: Til (Language) + Mavzu (Theme) rows + Logout button
            MoreClient renders a second card for Til/Mavzu and the logout button below */}
        <MoreClient lang={lang} />
      </main>
    </div>
  );
}
