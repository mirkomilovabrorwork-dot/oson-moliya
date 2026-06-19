"use client";

import { useState, useEffect } from "react";
import type { LangCode } from "@/lib/i18n/translate";
import { t } from "@/lib/i18n/translate";
import { translateCategoryName } from "@/lib/categories-i18n";

type SupportedCurrency = "UZS" | "USD" | "EUR" | "RUB";

interface AccountOption {
  id: string;
  name: string;
  type: string;
}

interface QuickAddFormProps {
  lang: LangCode;
  categories: Array<{ id: string; name: string; type: string; emoji: string | null }>;
  onSuccess?: () => void;
  /** Default main currency for the currency picker (from user settings). Defaults to UZS. */
  mainCurrency?: SupportedCurrency;
  /** When true, renders without the outer card chrome (background/border/rounded/padding)
   *  and without the inner <h3> title. Use inside AddSheet which already provides a header. */
  bare?: boolean;
}

const CURRENCIES: SupportedCurrency[] = ["UZS", "USD", "EUR", "RUB"];

const CURRENCY_LABELS: Record<SupportedCurrency, Record<LangCode, string>> = {
  UZS: { uz: "So'm", ru: "Сум", en: "So'm" },
  USD: { uz: "USD $", ru: "USD $", en: "USD $" },
  EUR: { uz: "EUR €", ru: "EUR €", en: "EUR €" },
  RUB: { uz: "RUB ₽", ru: "RUB ₽", en: "RUB ₽" },
};

export function QuickAddForm({ lang, categories, onSuccess, mainCurrency = "UZS", bare = false }: QuickAddFormProps) {
  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<SupportedCurrency>(mainCurrency);
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [note, setNote] = useState("");
  // A4: Initialize to empty string to avoid SSR/client mismatch (hydration fix).
  // A useEffect sets today's date on mount so the field still defaults to today.
  const [occurredAt, setOccurredAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // A4: Set today's date on mount (client-side only) to avoid SSR/hydration mismatch.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- date must be client-only to avoid SSR/hydration mismatch
    setOccurredAt(new Date().toISOString().slice(0, 10));
  }, []);

  // Lazy-load accounts once on mount
  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          setAccounts(
            (data as AccountOption[]).map((a) => ({
              id: a.id,
              name: a.name,
              type: a.type,
            }))
          );
        }
      })
      .catch(() => {
        // Accounts are optional — silently ignore failures
      });
  }, []);

  const filteredCategories = categories.filter((c) => c.type === type);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setSuccess(false);
    setLoading(true);

    try {
      const cleanAmount = amount.replace(/[\s ,]/g, "");

      // Build request body based on currency
      const body: Record<string, unknown> = {
        type,
        categoryId: categoryId || undefined,
        accountId: accountId || undefined,
        note: note || undefined,
        occurredAt: new Date(occurredAt + "T00:00:00+05:00").toISOString(),
      };

      if (currency === "UZS") {
        // Legacy path: send amountUzs as integer string
        body.amountUzs = cleanAmount;
      } else {
        // Multi-currency path: send nativeAmount + currency
        body.nativeAmount = cleanAmount;
        body.currency = currency;
      }

      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error || t("error.generic", lang)
        );
      }

      setAmount("");
      setCategoryId("");
      setAccountId("");
      setNote("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      onSuccess?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("error.generic", lang)
      );
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    "w-full rounded-lg px-3 py-2.5 text-sm transition-all min-h-[44px]";
  const inputStyle = {
    border: "1px solid var(--border-strong)",
    background: "transparent",
    color: "var(--fg)",
  };

  const formClass = bare
    ? "space-y-4"
    : "rounded-[10px] p-6 space-y-4";
  const formStyle = bare
    ? undefined
    : { background: "var(--surface)", border: "1px solid var(--border)" };

  // Amount placeholder: show currency-appropriate hint
  const amountPlaceholder = currency === "UZS"
    ? "500 000"
    : currency === "RUB"
    ? "5 000"
    : "100.00";

  return (
    <form
      onSubmit={handleSubmit}
      className={formClass}
      style={formStyle}
    >
      {!bare && (
        <h3
          className="font-semibold text-sm"
          style={{ color: "var(--fg)" }}
        >
          {t("overview.quick_add", lang)}
        </h3>
      )}

      {error && (
        <div
          className="text-sm px-3 py-2.5 rounded-lg"
          style={{
            background: "var(--expense-wash)",
            color: "var(--expense)",
          }}
          role="alert"
        >
          {error}
        </div>
      )}
      {success && (
        <div
          className="text-sm px-3 py-2.5 rounded-lg"
          style={{
            background: "var(--income-wash)",
            color: "var(--income)",
          }}
          role="status"
        >
          {t("form.success", lang)}
        </div>
      )}

      {/* Type toggle — segmented control: active = raised neutral surface, NOT accent fill */}
      <div
        className="flex rounded-md p-0.5 gap-0.5"
        style={{ background: "var(--surface-sunken)" }}
      >
        {(["income", "expense"] as const).map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => {
              setType(opt);
              setCategoryId("");
            }}
            className="flex-1 py-2 rounded-[8px] text-sm font-medium transition-all min-h-[36px]"
            style={
              type === opt
                ? {
                    background: "var(--surface)",
                    color: opt === "income" ? "var(--income)" : "var(--expense)",
                    boxShadow: "var(--shadow-sm)",
                  }
                : { color: "var(--fg-subtle)" }
            }
          >
            {t(`form.type.${opt}`, lang)}
          </button>
        ))}
      </div>

      {/* Amount + Currency — side by side */}
      <div className="flex gap-2">
        <div className="flex-1">
          <label
            className="block text-xs font-medium mb-1.5"
            style={{ color: "var(--fg-muted)" }}
          >
            {t("form.amount", lang)}
          </label>
          <input
            type="text"
            inputMode="decimal"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={amountPlaceholder}
            className={`${inputCls} tabular`}
            style={inputStyle}
          />
        </div>
        <div style={{ minWidth: 100 }}>
          <label
            className="block text-xs font-medium mb-1.5"
            style={{ color: "var(--fg-muted)" }}
          >
            {t("form.currency", lang)}
          </label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as SupportedCurrency)}
            className={inputCls}
            style={inputStyle}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {CURRENCY_LABELS[c][lang]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* CBU note when foreign currency is selected */}
      {currency !== "UZS" && (
        <p className="text-xs -mt-2" style={{ color: "var(--fg-subtle)" }}>
          {t("more.currency_cbu_note", lang)}
        </p>
      )}

      {/* Category */}
      <div>
        <label
          className="block text-xs font-medium mb-1.5"
          style={{ color: "var(--fg-muted)" }}
        >
          {t("form.category", lang)}
        </label>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className={inputCls}
          style={inputStyle}
        >
          <option value="">{t("form.category_none", lang)}</option>
          {filteredCategories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.emoji ? `${cat.emoji} ` : ""}
              {translateCategoryName(cat.name, lang)}
            </option>
          ))}
        </select>
      </div>

      {/* Account (optional) — only shown when accounts exist */}
      {accounts.length > 0 && (
        <div>
          <label
            className="block text-xs font-medium mb-1.5"
            style={{ color: "var(--fg-muted)" }}
          >
            {t("account.select", lang)}
          </label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className={inputCls}
            style={inputStyle}
          >
            <option value="">{t("account.none", lang)}</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Date */}
      <div>
        <label
          className="block text-xs font-medium mb-1.5"
          style={{ color: "var(--fg-muted)" }}
        >
          {t("form.date", lang)}
        </label>
        <input
          type="date"
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
          className={inputCls}
          style={inputStyle}
        />
      </div>

      {/* Note */}
      <div>
        <label
          className="block text-xs font-medium mb-1.5"
          style={{ color: "var(--fg-muted)" }}
        >
          {t("form.note", lang)}
        </label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={inputCls}
          style={inputStyle}
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all min-h-[44px] disabled:opacity-60"
        style={{ background: "var(--accent-gradient)", color: "#fff", boxShadow: "var(--shadow-sm)" }}
      >
        {loading ? t("form.submitting", lang) : t("form.submit", lang)}
      </button>
    </form>
  );
}
