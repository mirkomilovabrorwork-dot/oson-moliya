import { cookies } from "next/headers";
import { t, type LangCode } from "@/lib/i18n";
import { LangSwitcher } from "@/components/LangSwitcher";

export default async function LoginPage() {
  let lang: LangCode = "uz";
  try {
    const cookieStore = await cookies();
    const c = cookieStore.get("pultrack_lang")?.value;
    if (c === "ru" || c === "en" || c === "uz") lang = c;
  } catch {
    // build-time safety
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "var(--color-bg)" }}
    >
      {/* Lang switcher */}
      <div className="fixed top-4 right-4">
        <LangSwitcher currentLang={lang} />
      </div>

      <div
        className="w-full max-w-sm rounded-[10px] p-8 space-y-6"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        {/* Brand */}
        <div className="text-center space-y-2">
          <div className="text-5xl mb-4">💰</div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>
            {t("login.title", lang)}
          </h1>
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            {t("login.description", lang)}
          </p>
        </div>

        {/* Instruction card */}
        <div
          className="rounded-xl p-5 space-y-2"
          style={{ background: "var(--color-brand-light)" }}
        >
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ color: "var(--color-brand)", flexShrink: 0 }}>
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
            </svg>
            <p className="text-sm font-semibold" style={{ color: "var(--color-brand)" }}>
              {t("login.instruction", lang)}
            </p>
          </div>
          <p className="text-xs pl-6" style={{ color: "var(--color-text-secondary)" }}>
            /login
          </p>
        </div>

        {/* CTA */}
        <a
          href="https://t.me/oson_moliya_bot"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-bold transition-all"
          style={{ background: "var(--color-brand)", color: "#fff" }}
        >
          {t("login.open_bot", lang)}
        </a>
      </div>
    </div>
  );
}
