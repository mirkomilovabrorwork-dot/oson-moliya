"use client";

import { useState } from "react";
import type { LangCode } from "@/lib/i18n/translate";
import { t } from "@/lib/i18n/translate";

interface QuickAddFormProps {
  lang: LangCode;
  categories: Array<{ id: string; name: string; type: string; emoji: string | null }>;
  onSuccess?: () => void;
}

export function QuickAddForm({ lang, categories, onSuccess }: QuickAddFormProps) {
  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [note, setNote] = useState("");
  const [occurredAt, setOccurredAt] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const filteredCategories = categories.filter((c) => c.type === type);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);

    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          amountUzs: amount.replace(/[\s ]/g, ""),
          categoryId: categoryId || undefined,
          note: note || undefined,
          occurredAt: new Date(occurredAt + "T00:00:00+05:00").toISOString(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error || t("error.generic", lang)
        );
      }

      setAmount("");
      setCategoryId("");
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

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[10px] p-6 space-y-4"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      <h3
        className="font-semibold text-sm"
        style={{ color: "var(--fg)" }}
      >
        {t("overview.quick_add", lang)}
      </h3>

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

      {/* Amount */}
      <div>
        <label
          className="block text-xs font-medium mb-1.5"
          style={{ color: "var(--fg-muted)" }}
        >
          {t("form.amount", lang)}
        </label>
        <input
          type="text"
          inputMode="numeric"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="500 000"
          className={`${inputCls} tabular`}
          style={inputStyle}
        />
      </div>

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
              {cat.name}
            </option>
          ))}
        </select>
      </div>

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
        style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
      >
        {loading ? t("form.submitting", lang) : t("form.submit", lang)}
      </button>
    </form>
  );
}
