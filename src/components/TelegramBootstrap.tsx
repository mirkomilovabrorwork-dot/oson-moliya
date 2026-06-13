"use client";

import { useEffect, useState } from "react";

/**
 * TelegramBootstrap — runs on the /login page.
 *
 * If the page is opened inside a Telegram Mini App (window.Telegram.WebApp.initData
 * is non-empty), we silently authenticate via POST /api/auth/telegram and redirect
 * to the dashboard. While this is in-flight we show "Kirilyapti…".
 *
 * If NOT inside Telegram (no initData) this component renders nothing and the
 * normal login UI is shown unchanged.
 */
export function TelegramBootstrap() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Access the Telegram WebApp SDK safely (it's a no-op outside Telegram)
    const twa = (window as Window & { Telegram?: { WebApp?: { initData?: string; ready?: () => void; expand?: () => void } } }).Telegram?.WebApp;
    const initData = twa?.initData;

    if (!initData) {
      // Not inside Telegram — let the normal login UI render
      return;
    }

    // We are inside a Telegram Mini App
    setLoading(true);
    twa?.ready?.();
    twa?.expand?.();

    void (async () => {
      try {
        const res = await fetch("/api/auth/telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData }),
        });

        if (res.ok) {
          window.location.href = "/";
        } else {
          const data = (await res.json()) as { error?: string };
          setError(data.error ?? "Xatolik yuz berdi");
          setLoading(false);
        }
      } catch {
        setError("Tarmoq xatoligi");
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg)",
          zIndex: 9999,
          gap: "12px",
        }}
      >
        <svg
          width="36"
          height="36"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "var(--accent)", animation: "spin 1s linear infinite" }}
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        <p style={{ color: "var(--fg-muted)", fontSize: "14px" }}>Kirilyapti…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg)",
          zIndex: 9999,
        }}
      >
        <p style={{ color: "var(--fg-muted)", fontSize: "14px" }}>{error}</p>
      </div>
    );
  }

  return null;
}
