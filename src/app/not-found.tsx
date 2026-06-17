import Link from "next/link";
import { cookies } from "next/headers";

type Lang = "uz" | "ru" | "en";

const STRINGS: Record<Lang, { heading: string; body: string; home: string }> = {
  uz: {
    heading: "Sahifa topilmadi",
    body: "Bu sahifa mavjud emas yoki ko'chirilgan bo'lishi mumkin.",
    home: "Bosh sahifaga qaytish",
  },
  ru: {
    heading: "Страница не найдена",
    body: "Эта страница не существует или была перемещена.",
    home: "На главную",
  },
  en: {
    heading: "Page not found",
    body: "This page does not exist or may have been moved.",
    home: "Go home",
  },
};

export default async function NotFound() {
  const cookieStore = await cookies();
  const raw = cookieStore.get("pultrack_lang")?.value;
  const lang: Lang = raw === "ru" || raw === "en" || raw === "uz" ? raw : "uz";
  const s = STRINGS[lang];

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: "transparent" }}
    >
      <div
        className="w-full max-w-sm rounded-[var(--radius-lg)] p-8 text-center space-y-4"
        style={{ background: "var(--surface-elevated)", border: "1px solid var(--border)", boxShadow: "var(--shadow-md)" }}
      >
        <p className="text-4xl font-semibold tabular" style={{ color: "var(--fg-subtle)" }}>
          404
        </p>
        <h1 className="text-lg font-medium" style={{ color: "var(--fg)" }}>
          {s.heading}
        </h1>
        <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
          {s.body}
        </p>
        <Link
          href="/"
          className="inline-block mt-2 w-full py-2.5 rounded-lg text-sm font-medium transition-all text-center"
          style={{ background: "var(--accent-gradient)", color: "#fff" }}
        >
          {s.home}
        </Link>
      </div>
    </div>
  );
}
