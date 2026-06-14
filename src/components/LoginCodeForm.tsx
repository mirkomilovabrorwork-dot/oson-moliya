"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { t, type LangCode } from "@/lib/i18n/translate";

type Props = {
  lang: LangCode;
};

type CodeResponse = {
  ok?: boolean;
  error?: string;
  redirectTo?: string;
};

export function LoginCodeForm({ lang }: Props) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");
  const canSubmit = code.length === 6 && status !== "loading";

  const submitCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = code.replace(/\D/g, "");

    if (!/^\d{6}$/.test(normalized)) {
      setStatus("error");
      setMessage(t("login.code.invalid", lang));
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/auth/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: normalized }),
      });
      const data = (await res.json()) as CodeResponse;

      if (res.ok && data.redirectTo) {
        window.location.assign(data.redirectTo);
        return;
      }

      setStatus("error");
      setMessage(
        data.error === "too_many_attempts"
          ? t("login.code.too_many", lang)
          : t("login.code.error", lang)
      );
    } catch {
      setStatus("error");
      setMessage(t("login.code.network", lang));
    }
  };

  return (
    <form className="space-y-3" onSubmit={submitCode}>
      <div className="space-y-2">
        <label
          className="block text-xs font-semibold uppercase tracking-[0.08em]"
          htmlFor="telegram-login-code"
          style={{ color: "var(--fg-muted)" }}
        >
          {t("login.code.label", lang)}
        </label>
        <input
          id="telegram-login-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          value={code}
          onChange={(event) => {
            setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
            if (status === "error") {
              setStatus("idle");
              setMessage("");
            }
          }}
          placeholder=""
          className="w-full rounded-xl px-4 py-3 text-center text-2xl font-semibold tabular-nums outline-none transition"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--fg)",
            letterSpacing: "0.18em",
          }}
        />
      </div>
      {message ? (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {message}
        </p>
      ) : (
        <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
          {t("login.code.hint", lang)}
        </p>
      )}
      <button
        type="submit"
        disabled={!canSubmit}
        className="flex min-h-11 w-full items-center justify-center rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-55"
        style={{
          background: canSubmit ? "var(--accent-gradient)" : "var(--surface-sunken)",
          color: canSubmit ? "#fff" : "var(--fg-muted)",
          boxShadow: canSubmit ? "var(--shadow-sm)" : "none",
        }}
      >
        {status === "loading" ? t("login.code.checking", lang) : t("login.code.submit", lang)}
      </button>
    </form>
  );
}
