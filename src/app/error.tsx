"use client";

import { useEffect } from "react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: "var(--color-bg)" }}
    >
      <div
        className="w-full max-w-sm rounded-[10px] p-8 text-center space-y-4"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        <p className="text-3xl">⚠️</p>
        <h1 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Nimadir noto&apos;g&apos;ri ketdi
        </h1>
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          Sahifani yangilash yoki qaytadan urinib ko&apos;ring.
        </p>
        <div className="flex flex-col gap-2 pt-2">
          <button
            onClick={reset}
            className="w-full py-2.5 rounded-[10px] text-sm font-semibold transition-all"
            style={{ background: "var(--color-brand)", color: "#fff" }}
          >
            Qayta urinish
          </button>
          <a
            href="/"
            className="w-full py-2.5 rounded-[10px] text-sm font-medium text-center block transition-all"
            style={{ border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}
          >
            Bosh sahifaga qaytish
          </a>
        </div>
      </div>
    </div>
  );
}
