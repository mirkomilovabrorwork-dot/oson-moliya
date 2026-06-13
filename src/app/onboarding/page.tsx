import { cookies } from "next/headers";
import Link from "next/link";
import { t, type LangCode } from "@/lib/i18n";
import { LangSwitcher } from "@/components/LangSwitcher";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  let lang: LangCode = "uz";
  try {
    const store = await cookies();
    const c = store.get("pultrack_lang")?.value;
    if (c === "ru" || c === "en" || c === "uz") lang = c;
  } catch {
    // build-time safety
  }

  const examples = [
    t("onboarding.example1", lang),
    t("onboarding.example2", lang),
    t("onboarding.example3", lang),
  ];

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: "var(--color-bg)" }}
    >
      {/* Lang switcher top-right */}
      <div className="fixed top-4 right-4">
        <LangSwitcher currentLang={lang} />
      </div>

      <div
        className="w-full max-w-md rounded-2xl p-8 shadow-sm space-y-6"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="text-5xl mb-4">💼</div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>
            {t("onboarding.title", lang)}
          </h1>
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            {t("onboarding.subtitle", lang)}
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-4">
          <div
            className="rounded-xl p-4 space-y-3"
            style={{ background: "var(--color-brand-light)" }}
          >
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-brand)" }}>
              {t("onboarding.step1", lang)}
            </p>
            {examples.map((ex, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium tabular"
                style={{ background: "var(--color-surface)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)" }}
              >
                <span style={{ color: "var(--color-brand)" }}>→</span>
                <code style={{ fontFamily: "inherit" }}>{ex}</code>
              </div>
            ))}
          </div>

          <div
            className="flex items-start gap-3 rounded-xl p-4"
            style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}
          >
            <span className="text-xl mt-0.5">✅</span>
            <p className="text-sm" style={{ color: "#166534" }}>
              {t("onboarding.step3", lang)}
            </p>
          </div>

          <div
            className="flex items-start gap-3 rounded-xl p-4"
            style={{ background: "#F8FAFC", border: "1px solid var(--color-border)" }}
          >
            <span className="text-xl mt-0.5">📊</span>
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              {t("onboarding.hint", lang)}
            </p>
          </div>
        </div>

        {/* CTA */}
        <div className="space-y-3">
          <a
            href="https://t.me/PulTrackBot"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-bold transition-all"
            style={{ background: "var(--color-brand)", color: "#fff" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
            </svg>
            {t("onboarding.open_bot", lang)}
          </a>
          <Link
            href="/"
            className="flex items-center justify-center w-full py-3 rounded-xl text-sm font-semibold transition-all"
            style={{ background: "var(--color-surface)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}
          >
            {t("onboarding.go_dashboard", lang)}
          </Link>
        </div>
      </div>
    </div>
  );
}
