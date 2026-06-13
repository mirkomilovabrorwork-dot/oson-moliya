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

  const filteredCategories = categories.filter((c) => c.type === type);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          amountUzs: amount.replace(/\s/g, ""),
          categoryId: categoryId || undefined,
          note: note || undefined,
          occurredAt: new Date(occurredAt + "T00:00:00+05:00").toISOString(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || t("error.generic", lang));
      }

      // Reset form
      setAmount("");
      setCategoryId("");
      setNote("");
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error.generic", lang));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <h3 className="font-semibold text-gray-800">{t("overview.quick_add", lang)}</h3>

      {error && (
        <div className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded">{error}</div>
      )}

      {/* Type toggle */}
      <div className="flex gap-2">
        {(["income", "expense"] as const).map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => { setType(opt); setCategoryId(""); }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              type === opt
                ? opt === "income"
                  ? "bg-green-600 text-white"
                  : "bg-red-500 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t(`form.type.${opt}`, lang)}
          </button>
        ))}
      </div>

      {/* Amount */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {t("form.amount", lang)}
        </label>
        <input
          type="text"
          inputMode="numeric"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="500 000"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Category */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {t("form.category", lang)}
        </label>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">—</option>
          {filteredCategories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.emoji ? `${cat.emoji} ` : ""}{cat.name}
            </option>
          ))}
        </select>
      </div>

      {/* Date */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {t("form.date", lang)}
        </label>
        <input
          type="date"
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Note */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {t("form.note", lang)}
        </label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors"
      >
        {loading ? t("form.submitting", lang) : t("form.submit", lang)}
      </button>
    </form>
  );
}
