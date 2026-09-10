"use client";

import { useState, useEffect } from "react";
import type { LangCode } from "@/lib/i18n/translate";
import { t } from "@/lib/i18n/translate";
import { translateCategoryName } from "@/lib/categories-i18n";
import { tashkentParts } from "@/lib/capture/occurred-at";

type SupportedCurrency = "UZS" | "USD" | "EUR" | "RUB";

interface AccountOption {
  id: string;
  name: string;
  type: string;
}

interface QuickAddFormProps {
  lang: LangCode;
  categories: Array<{ id: string; name: string; type: string; emoji: string | null }>;
  /** Called after a successful save. Receives the created/updated transaction (serialized, with
   *  its `category` relation) when the caller wants to render it (e.g. /capture's Done
   *  card) — existing callers that ignore the argument keep working unchanged. */
  onSuccess?: (tx?: Record<string, unknown>) => void;
  /** Default main currency for the currency picker (from user settings). Defaults to UZS. */
  mainCurrency?: SupportedCurrency;
  /** When true, renders without the outer card chrome (background/border/rounded/padding)
   *  and without the inner <h3> title. Use inside AddSheet which already provides a header. */
  bare?: boolean;
  /** When set, the form edits this existing transaction instead of creating a new one:
   *  fields are pre-filled from it and submit sends PATCH /api/transactions/[id]. */
  editTx?: {
    id: string;
    type: "income" | "expense";
    amountUzs: string;
    categoryId?: string | null;
    note?: string | null;
    occurredAt: string;
  } | null;
}

/** Tashkent calendar date ("YYYY-MM-DD") for an ISO timestamp — for the date <input>. */
function tashkentDateStr(iso: string): string {
  const { y, m, d } = tashkentParts(iso);
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const CURRENCIES: SupportedCurrency[] = ["UZS", "USD", "EUR", "RUB"];

const CURRENCY_LABELS: Record<SupportedCurrency, Record<LangCode, string>> = {
  UZS: { uz: "So'm", ru: "Сум", en: "So'm" },
  USD: { uz: "USD $", ru: "USD $", en: "USD $" },
  EUR: { uz: "EUR €", ru: "EUR €", en: "EUR €" },
  RUB: { uz: "RUB ₽", ru: "RUB ₽", en: "RUB ₽" },
};

export function QuickAddForm({ lang, categories, onSuccess, mainCurrency = "UZS", bare = false, editTx = null }: QuickAddFormProps) {
  const [type, setType] = useState<"income" | "expense">(editTx?.type ?? "expense");
  const [amount, setAmount] = useState(editTx ? editTx.amountUzs : "");
  const [currency, setCurrency] = useState<SupportedCurrency>(mainCurrency);
  const [categoryId, setCategoryId] = useState(editTx?.categoryId ?? "");
  const [accountId, setAccountId] = useState("");
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [note, setNote] = useState(editTx?.note ?? "");
  // A4: Initialize to empty string to avoid SSR/client mismatch (hydration fix).
  // A useEffect sets today's date on mount so the field still defaults to today.
  // Edit mode pre-fills from the row's Tashkent calendar date (not UTC) so a capture
  // made 00:00-04:59 Tashkent doesn't appear to be "yesterday" and shift when saved.
  const originalTashkentDate = editTx ? tashkentDateStr(editTx.occurredAt) : "";
  const [occurredAt, setOccurredAt] = useState(originalTashkentDate);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // A4: Set today's date on mount (client-side only) to avoid SSR/hydration mismatch.
  // Edit mode already pre-fills the transaction's own date — skip the today-default.
  useEffect(() => {
    if (editTx) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- date must be client-only to avoid SSR/hydration mismatch
    // Tashkent date, not the UTC one: between 00:00 and 04:59 local the UTC
    // string is still YESTERDAY, which pre-filled the wrong day and also broke
    // the "chosen day is today -> stamp the real moment" branch in submit.
    setOccurredAt(tashkentDateStr(new Date().toISOString()));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount only
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

      let res: Response;
      if (editTx) {
        // Edit mode: PATCH the existing transaction. The PATCH route only accepts
        // amountUzs (no multi-currency fields), so send the amount as-is.
        // Only rewrite occurredAt when the user actually changed the date field —
        // otherwise keep the row's original instant (date AND time) untouched.
        const occurredAtOut =
          occurredAt !== originalTashkentDate
            ? new Date(occurredAt + "T00:00:00+05:00").toISOString()
            : editTx.occurredAt;
        res = await fetch(`/api/transactions/${editTx.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type,
            amountUzs: cleanAmount,
            categoryId: categoryId || null,
            note: note || null,
            occurredAt: occurredAtOut,
          }),
        });
      } else {
        // Build request body based on currency
        const body: Record<string, unknown> = {
          type,
          categoryId: categoryId || undefined,
          accountId: accountId || undefined,
          note: note || undefined,
          // A date input carries no time, so a plain parse stamps Tashkent
          // midnight — and the capture confirmation then reads "bugun, 00:00"
          // for an entry made at 18:23. When the chosen day IS today, use the
          // real moment instead, exactly as the bot does for the word "today".
          // Other days keep midnight: the hour is genuinely unknown there.
          occurredAt:
            occurredAt === tashkentDateStr(new Date().toISOString())
              ? new Date().toISOString()
              : new Date(occurredAt + "T00:00:00+05:00").toISOString(),
        };

        if (currency === "UZS") {
          // Legacy path: send amountUzs as integer string
          body.amountUzs = cleanAmount;
        } else {
          // Multi-currency path: send nativeAmount + currency
          body.nativeAmount = cleanAmount;
          body.currency = currency;
        }

        res = await fetch("/api/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error || t("error.generic", lang)
        );
      }

      if (!editTx) {
        setAmount("");
        setCategoryId("");
        setAccountId("");
        setNote("");
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      onSuccess?.(data as Record<string, unknown>);
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
            {editTx ? `${t("form.amount", lang)} (${CURRENCY_LABELS.UZS[lang]})` : t("form.amount", lang)}
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
        {/* Edit mode always sends amountUzs (PATCH), so the currency picker would be
            misleading — the row's actual currency can only be changed via a new capture. */}
        {!editTx && (
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
        )}
      </div>

      {/* CBU note when foreign currency is selected (create mode only) */}
      {!editTx && currency !== "UZS" && (
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
