import { cookies } from "next/headers";
import { t, type LangCode } from "@/lib/i18n";
import { LangSwitcher } from "@/components/LangSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TelegramBootstrap } from "@/components/TelegramBootstrap";
import { LoginCodeForm } from "@/components/LoginCodeForm";

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
      className="flex items-center justify-center px-4 py-6 sm:py-10 lg:px-8"
      style={{ background: "transparent", minHeight: "100dvh" }}
    >
      {/* Telegram Mini App auto-auth: if inside Telegram, authenticates and redirects.
          If not in Telegram, renders nothing and the normal UI below is shown. */}
      <TelegramBootstrap />
      {/* Lang + Theme switchers */}
      <div className="fixed right-4 top-4 z-10 flex items-center gap-2">
        <ThemeToggle lang={lang} />
        <LangSwitcher currentLang={lang} />
      </div>

      <div
        className="grid w-full max-w-5xl gap-5 lg:grid-cols-[0.95fr_1.05fr] lg:items-stretch"
      >
        <section
          className="hidden rounded-[var(--radius-lg)] p-8 lg:flex lg:flex-col lg:justify-between"
          style={{
            background: "var(--accent-gradient)",
            boxShadow: "var(--shadow-lg)",
            color: "#fff",
            minHeight: 520,
          }}
        >
          <div className="space-y-6">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{ background: "rgba(255,255,255,0.16)" }}
            >
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 6v2m0 8v2M8.5 9a3.5 3.5 0 0 1 7 0c0 4-7 4-7 7h7"/>
              </svg>
            </div>
            <div className="max-w-sm space-y-3">
              <p className="text-sm font-semibold uppercase tracking-[0.08em]" style={{ color: "rgba(255,255,255,0.72)" }}>
                {t("login.title", lang)}
              </p>
              <h1 className="text-4xl font-bold leading-tight">
                {t("login.description", lang)}
              </h1>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            {[t("form.type.income", lang), t("form.type.expense", lang), t("nav.debts", lang)].map((item) => (
              <div
                key={item}
                className="rounded-2xl px-4 py-3"
                style={{ background: "rgba(255,255,255,0.13)", border: "1px solid rgba(255,255,255,0.18)" }}
              >
                {item}
              </div>
            ))}
          </div>
        </section>

        <section
          className="w-full rounded-[var(--radius-lg)] p-6 sm:p-8"
          style={{
            background: "var(--surface-elevated)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          {/* Brand */}
          <div className="space-y-2 text-center lg:text-left">
            <div
              className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl lg:mx-0"
              style={{ background: "var(--accent-gradient)", boxShadow: "var(--shadow-lg)" }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#fff" }}>
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 6v2m0 8v2M8.5 9a3.5 3.5 0 0 1 7 0c0 4-7 4-7 7h7"/>
              </svg>
            </div>
            <h1 className="text-2xl font-bold" style={{ color: "var(--fg)" }}>
              {t("login.title", lang)}
            </h1>
            <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
              {t("login.description", lang)}
            </p>
          </div>

        <div className="my-6 h-px" style={{ background: "var(--border)" }} />

        {/* Instruction */}
        <div
          className="space-y-2 rounded-2xl p-4"
          style={{ background: "var(--accent-wash)" }}
        >
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ color: "var(--accent)", flexShrink: 0 }}>
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
            </svg>
            <p className="text-sm font-semibold" style={{ color: "var(--accent)" }}>
              {t("login.instruction", lang)}
            </p>
          </div>
          <p className="text-xs pl-6" style={{ color: "var(--fg-muted)" }}>
            {t("login.steps", lang)}
          </p>
        </div>

        <div className="my-6 space-y-3">
          <h2 className="text-base font-semibold" style={{ color: "var(--fg)" }}>
            {t("login.code.title", lang)}
          </h2>
          <LoginCodeForm lang={lang} />
        </div>

        {/* CTA */}
        <a
          href="https://t.me/oson_moliya_bot?start=login"
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-all"
          style={{ background: "var(--accent-gradient)", color: "#fff", boxShadow: "var(--shadow-sm)" }}
        >
          {t("login.open_bot", lang)}
        </a>
        </section>
      </div>
    </div>
  );
}
