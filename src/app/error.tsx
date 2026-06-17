"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

type Lang = "uz" | "ru" | "en";

function getLangFromCookie(): Lang {
  if (typeof document === "undefined") return "uz";
  const match = document.cookie.match(/(?:^|;\s*)pultrack_lang=([^;]+)/);
  const val = match?.[1];
  if (val === "ru" || val === "en" || val === "uz") return val;
  return "uz";
}

const STRINGS: Record<Lang, { heading: string; body: string; retry: string; home: string }> = {
  uz: {
    heading: "Nimadir noto’g’ri ketdi",
    body: "Sahifani yangilash yoki qaytadan urinib ko’ring.",
    retry: "Qayta urinish",
    home: "Bosh sahifaga qaytish",
  },
  ru: {
    heading: "Что-то пошло не так",
    body: "Попробуйте обновить страницу или повторить попытку.",
    retry: "Повторить",
    home: "На главную",
  },
  en: {
    heading: "Something went wrong",
    body: "Try refreshing the page or try again.",
    retry: "Try again",
    home: "Go home",
  },
};

export default function GlobalError({ error, reset }: ErrorProps) {
  const [lang, setLang] = useState<Lang>("uz");

  useEffect(() => {
    setLang(getLangFromCookie());
  }, []);

  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

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
        <p className="text-lg font-medium" style={{ color: "var(--fg)" }}>
          {s.heading}
        </p>
        <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
          {s.body}
        </p>
        <div className="flex flex-col gap-2 pt-2">
          <button
            onClick={reset}
            className="w-full py-2.5 rounded-lg text-sm font-medium transition-all"
            style={{ background: "var(--accent-gradient)", color: "#fff" }}
          >
            {s.retry}
          </button>
          <Link
            href="/"
            className="w-full py-2.5 rounded-lg text-sm font-medium text-center block transition-all"
            style={{ border: "1px solid var(--border-strong)", color: "var(--fg-muted)" }}
          >
            {s.home}
          </Link>
        </div>
      </div>
    </div>
  );
}
