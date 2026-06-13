import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { resolveLang, t } from "@/lib/i18n";
import { TopNav } from "@/components/TopNav";
import { BottomNav } from "@/components/BottomNav";
import { AddSheet } from "@/components/AddSheet";

export const dynamic = "force-dynamic";

export default async function DebtsPage() {
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
            style={{ background: "var(--accent-wash)", color: "var(--accent)" }}
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
              <path d="M20 12c0 1.1-.9 2-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4z" />
              <circle cx="10" cy="10" r="1.5" />
              <circle cx="14" cy="10" r="1.5" />
              <path d="M4 14c0 2.2 1.8 4 4 4h8c2.2 0 4-1.8 4-4" />
            </svg>
          </div>

          {/* Heading */}
          <h1
            className="text-2xl font-bold text-center"
            style={{ color: "var(--fg)" }}
          >
            {t("nav.debts", lang)}
          </h1>

          {/* Muted description */}
          <p
            className="text-sm text-center"
            style={{ color: "var(--fg-muted)", maxWidth: "260px" }}
          >
            {t("debts.soon_desc", lang)}
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
