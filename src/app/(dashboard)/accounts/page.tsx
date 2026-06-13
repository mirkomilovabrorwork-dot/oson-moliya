import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { resolveLang, t } from "@/lib/i18n";
import { TopNav } from "@/components/TopNav";
import { BottomNav } from "@/components/BottomNav";
import { AddSheet } from "@/components/AddSheet";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const lang = await resolveLang(user.language);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <TopNav lang={lang} />
      <BottomNav lang={lang} />
      <AddSheet lang={lang} />
      <main className="max-w-2xl mx-auto px-4 sm:px-8 py-6 pb-28">
        <div
          className="flex flex-col items-center justify-center"
          style={{ minHeight: "60vh", gap: "1.25rem" }}
        >
          {/* Icon tile */}
          <div
            className="flex items-center justify-center w-16 h-16 rounded-[18px]"
            style={{ background: "var(--income-wash)", color: "var(--income)" }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
          </div>

          {/* Heading */}
          <h1
            className="text-2xl font-bold text-center"
            style={{ color: "var(--fg)" }}
          >
            {t("more.accounts", lang)}
          </h1>

          {/* Muted description */}
          <p
            className="text-sm text-center"
            style={{ color: "var(--fg-muted)", maxWidth: "260px" }}
          >
            {t("accounts.soon_desc", lang)}
          </p>

          {/* "Coming soon" pill */}
          <span
            className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide"
            style={{
              background: "var(--accent-wash)",
              color: "var(--accent)",
            }}
          >
            {t("common.soon", lang)}
          </span>
        </div>
      </main>
    </div>
  );
}
