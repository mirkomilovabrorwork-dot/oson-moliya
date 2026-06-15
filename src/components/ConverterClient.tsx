"use client";

import { useState, useMemo } from "react";
import type { Rates } from "@/lib/rates";
import type { LangCode } from "@/lib/i18n/translate";
import { t } from "@/lib/i18n/translate";
import { formatNative } from "@/lib/currency";

type Currency = "UZS" | "USD" | "EUR" | "RUB";

interface ConverterClientProps {
  rates: Rates;
  lang: LangCode;
}

const CURRENCIES: Currency[] = ["UZS", "USD", "EUR", "RUB"];

const CURRENCY_LABELS: Record<Currency, string> = {
  UZS: "UZS — so'm",
  USD: "USD — $",
  EUR: "EUR — €",
  RUB: "RUB — ₽",
};

const CURRENCY_SYMBOLS: Record<Currency, string> = {
  UZS: "so'm",
  USD: "$",
  EUR: "€",
  RUB: "₽",
};

/** Convert amount in `from` to `to` using CBU rates (UZS = base). */
function convert(amount: number, from: Currency, to: Currency, rates: Rates): number {
  if (isNaN(amount) || amount < 0) return 0;
  // Step 1: to UZS
  const amountInUzs = from === "UZS" ? amount : amount * rates[from];
  // Step 2: from UZS to target
  const result = to === "UZS" ? amountInUzs : amountInUzs / rates[to];
  return result;
}

/** Rate line: how many `to` per 1 `from` */
function getRate(from: Currency, to: Currency, rates: Rates): number {
  return convert(1, from, to, rates);
}

/** Format a number for display with thousands separators, up to 2 decimal places. */
function formatResult(value: number, currency: Currency, lang: LangCode): string {
  if (!isFinite(value) || isNaN(value)) return "0";
  return formatNative(value, currency, lang);
}

/** Format the rate line number: if >=10 show no decimals, else up to 4 sig decimals. */
function formatRateNumber(n: number): string {
  if (!isFinite(n) || isNaN(n)) return "0";
  if (n >= 10) {
    // Space-grouped integer
    const rounded = Math.round(n);
    const s = String(rounded);
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }
  // Small number — up to 4 significant decimals
  return parseFloat(n.toPrecision(4)).toString();
}

export function ConverterClient({ rates, lang }: ConverterClientProps) {
  const [fromCurrency, setFromCurrency] = useState<Currency>("USD");
  const [amount, setAmount] = useState<string>("1");
  const [toCurrency, setToCurrency] = useState<Currency>("UZS");

  const numericAmount = useMemo(() => {
    const n = parseFloat(amount);
    return isNaN(n) || n < 0 ? 0 : n;
  }, [amount]);

  const result = useMemo(
    () => convert(numericAmount, fromCurrency, toCurrency, rates),
    [numericAmount, fromCurrency, toCurrency, rates]
  );

  const rateValue = useMemo(
    () => getRate(fromCurrency, toCurrency, rates),
    [fromCurrency, toCurrency, rates]
  );

  const handleSwap = () => {
    setFromCurrency(toCurrency);
    setToCurrency(fromCurrency);
  };

  const cardStyle: React.CSSProperties = {
    background: "var(--surface-elevated)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    padding: "16px",
    boxShadow: "var(--shadow-sm)",
  };

  const selectStyle: React.CSSProperties = {
    background: "var(--surface-sunken)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md, 8px)",
    color: "var(--fg)",
    fontSize: "0.875rem",
    fontWeight: 600,
    padding: "10px 12px",
    minHeight: 44,
    width: "100%",
    cursor: "pointer",
    appearance: "none",
    WebkitAppearance: "none",
  };

  const inputStyle: React.CSSProperties = {
    background: "var(--surface-sunken)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md, 8px)",
    color: "var(--fg)",
    fontSize: "1.25rem",
    fontWeight: 700,
    padding: "10px 12px",
    minHeight: 44,
    width: "100%",
    outline: "none",
    fontVariantNumeric: "tabular-nums",
  };

  const labelStyle: React.CSSProperties = {
    color: "var(--fg-subtle)",
    fontSize: "0.75rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: 6,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* FROM card */}
      <div style={cardStyle}>
        <div style={labelStyle}>{t("converter.from", lang)}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Currency select */}
          <div style={{ position: "relative" }}>
            <select
              value={fromCurrency}
              onChange={(e) => setFromCurrency(e.target.value as Currency)}
              style={selectStyle}
              aria-label={t("converter.from", lang)}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {CURRENCY_LABELS[c]}
                </option>
              ))}
            </select>
            {/* Custom dropdown arrow */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                pointerEvents: "none",
                color: "var(--fg-muted)",
              }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
          {/* Amount input */}
          <input
            type="number"
            inputMode="decimal"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={inputStyle}
            placeholder="0"
            aria-label={t("form.amount", lang)}
          />
        </div>
      </div>

      {/* Swap button */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <button
          type="button"
          onClick={handleSwap}
          aria-label="Swap currencies"
          style={{
            background: "var(--accent-gradient, var(--accent))",
            color: "#fff",
            border: "none",
            borderRadius: "50%",
            width: 44,
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            boxShadow: "var(--shadow-sm)",
            transition: "opacity 150ms ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M7 16V4m0 0L3 8m4-4l4 4" />
            <path d="M17 8v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        </button>
      </div>

      {/* TO card */}
      <div style={cardStyle}>
        <div style={labelStyle}>{t("converter.to", lang)}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Currency select */}
          <div style={{ position: "relative" }}>
            <select
              value={toCurrency}
              onChange={(e) => setToCurrency(e.target.value as Currency)}
              style={selectStyle}
              aria-label={t("converter.to", lang)}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {CURRENCY_LABELS[c]}
                </option>
              ))}
            </select>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                pointerEvents: "none",
                color: "var(--fg-muted)",
              }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
          {/* Result display (read-only) */}
          <div
            style={{
              ...inputStyle,
              color: numericAmount > 0 ? "var(--income, var(--accent))" : "var(--fg-muted)",
              userSelect: "text",
              cursor: "default",
            }}
            aria-label="Converted result"
            aria-readonly="true"
          >
            {formatResult(result, toCurrency, lang)}
          </div>
        </div>
      </div>

      {/* Rate info */}
      <div
        style={{
          background: "var(--surface-elevated)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: "12px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div
          style={{
            fontSize: "0.875rem",
            color: "var(--fg-muted)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          1 {fromCurrency} ≈ {formatRateNumber(rateValue)} {CURRENCY_SYMBOLS[toCurrency]}
        </div>
        <div style={{ fontSize: "0.75rem", color: "var(--fg-subtle)" }}>
          {t("more.currency_cbu_note", lang)}
        </div>
      </div>
    </div>
  );
}
