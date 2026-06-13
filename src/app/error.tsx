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
      style={{ background: "var(--bg)" }}
    >
      <div
        className="w-full max-w-sm rounded-md p-8 text-center space-y-4"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <p className="text-lg font-medium" style={{ color: "var(--fg)" }}>
          Nimadir noto&apos;g&apos;ri ketdi
        </p>
        <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
          Sahifani yangilash yoki qaytadan urinib ko&apos;ring.
        </p>
        <div className="flex flex-col gap-2 pt-2">
          <button
            onClick={reset}
            className="w-full py-2.5 rounded-lg text-sm font-medium transition-all"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            Qayta urinish
          </button>
          <a
            href="/"
            className="w-full py-2.5 rounded-lg text-sm font-medium text-center block transition-all"
            style={{ border: "1px solid var(--border-strong)", color: "var(--fg-muted)" }}
          >
            Bosh sahifaga qaytish
          </a>
        </div>
      </div>
    </div>
  );
}
