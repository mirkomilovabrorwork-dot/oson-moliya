"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { t, type LangCode } from "@/lib/i18n/translate";

type Props = {
  lang: LangCode;
};

type LoginResponse = {
  ok?: boolean;
  error?: string;
  redirectTo?: string;
};

export function PasswordLoginForm({ lang }: Props) {
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  const canSubmit = loginName.trim().length > 0 && password.length > 0 && status !== "loading";

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/auth/password-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginName: loginName.trim().toLowerCase(), password }),
      });
      const data = (await res.json()) as LoginResponse;

      if (res.ok && data.ok && data.redirectTo) {
        window.location.href = data.redirectTo;
        return;
      }

      setStatus("error");
      if (res.status === 429 || data.error === "too_many_attempts") {
        setMessage(t("recovery.too_many", lang));
      } else {
        setMessage(t("recovery.bad_credentials", lang));
      }
    } catch {
      setStatus("error");
      setMessage(t("login.code.network", lang));
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
          {t("recovery.login_why", lang)}
        </p>
      </div>
      <form className="space-y-3" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <label
            className="block text-xs font-semibold uppercase tracking-[0.08em]"
            htmlFor="pw-login-name"
            style={{ color: "var(--fg-muted)" }}
          >
            {t("recovery.login_label", lang)}
          </label>
          <input
            id="pw-login-name"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={loginName}
            onChange={(e) => {
              setLoginName(e.target.value);
              if (status === "error") { setStatus("idle"); setMessage(""); }
            }}
            className="w-full rounded-xl px-4 py-3 text-sm outline-none transition"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--fg)",
            }}
          />
        </div>
        <div className="space-y-2">
          <label
            className="block text-xs font-semibold uppercase tracking-[0.08em]"
            htmlFor="pw-login-password"
            style={{ color: "var(--fg-muted)" }}
          >
            {t("recovery.password_label", lang)}
          </label>
          <input
            id="pw-login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (status === "error") { setStatus("idle"); setMessage(""); }
            }}
            className="w-full rounded-xl px-4 py-3 text-sm outline-none transition"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--fg)",
            }}
          />
        </div>
        {message && (
          <p className="text-sm" style={{ color: "var(--danger)" }}>
            {message}
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
          {status === "loading" ? t("recovery.checking", lang) : t("recovery.login_with_password", lang)}
        </button>
      </form>
    </div>
  );
}
