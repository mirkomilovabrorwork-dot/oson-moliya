"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { LangCode } from "@/lib/i18n/translate";
import { t } from "@/lib/i18n/translate";
import { Toast } from "@/components/Toast";

interface TxRow {
  id: string;
  type: "income" | "expense";
  amountUzs: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryEmoji: string | null;
  note: string | null;
  occurredAt: string;
  source: string;
}

interface CatOption {
  id: string;
  name: string;
  type: "income" | "expense";
  emoji: string | null;
}

interface Props {
  transactions: TxRow[];
  categories: CatOption[];
  lang: LangCode;
}

const PAGE_SIZE = 20;

function formatMoney(s: string): string {
  const n = Number(s);
  if (isNaN(n)) return s;
  const parts: string[] = [];
  let rem = Math.abs(Math.round(n));
  while (rem >= 1000) {
    parts.unshift(String(rem % 1000).padStart(3, "0"));
    rem = Math.floor(rem / 1000);
  }
  parts.unshift(String(rem));
  return parts.join(" ");
}

function formatDate(iso: string, lang: string): string {
  return new Intl.DateTimeFormat(
    lang === "ru" ? "ru-RU" : lang === "en" ? "en-US" : "uz-UZ",
    { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Tashkent" }
  ).format(new Date(iso));
}

interface EditState {
  id: string;
  type: "income" | "expense";
  amountUzs: string;
  categoryId: string;
  note: string;
  occurredAt: string;
}

export function TransactionsClient({ transactions: initial, categories, lang }: Props) {
  const router = useRouter();

  // Filter state
  const [typeFilter, setTypeFilter] = useState<"" | "income" | "expense">("");
  const [catFilter, setCatFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  // Live rows (optimistic delete/edit)
  const [rows, setRows] = useState<TxRow[]>(initial);

  // Edit modal state
  const [editing, setEditing] = useState<EditState | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
  };

  // Filtered rows
  const filtered = useMemo(() => {
    let r = rows;
    if (typeFilter) r = r.filter((tx) => tx.type === typeFilter);
    if (catFilter) r = r.filter((tx) => tx.categoryId === catFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      r = r.filter(
        (tx) =>
          (tx.note ?? "").toLowerCase().includes(q) ||
          (tx.categoryName ?? "").toLowerCase().includes(q)
      );
    }
    if (dateFrom) r = r.filter((tx) => tx.occurredAt >= dateFrom);
    if (dateTo) r = r.filter((tx) => tx.occurredAt <= dateTo + "T23:59:59Z");
    return r;
  }, [rows, typeFilter, catFilter, searchQuery, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pagedRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const resetFilters = () => {
    setTypeFilter("");
    setCatFilter("");
    setSearchQuery("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  // Delete handler
  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm(t("transactions.delete.confirm", lang))) return;
      setDeletingId(id);
      try {
        const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error();
        setRows((r) => r.filter((tx) => tx.id !== id));
        showToast(t("transactions.deleted", lang));
        router.refresh();
      } catch {
        showToast(t("error.generic", lang), "error");
      } finally {
        setDeletingId(null);
      }
    },
    [lang, router]
  );

  // Open edit modal
  const openEdit = (tx: TxRow) => {
    setEditing({
      id: tx.id,
      type: tx.type,
      amountUzs: tx.amountUzs,
      categoryId: tx.categoryId ?? "",
      note: tx.note ?? "",
      occurredAt: tx.occurredAt.slice(0, 10),
    });
    setEditError(null);
  };

  // Save edit
  const handleEditSave = async () => {
    if (!editing) return;
    setEditLoading(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/transactions/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: editing.type,
          amountUzs: editing.amountUzs.replace(/[\s ]/g, ""),
          categoryId: editing.categoryId || null,
          note: editing.note || null,
          occurredAt: new Date(editing.occurredAt + "T00:00:00+05:00").toISOString(),
        }),
      });
      if (!res.ok) throw new Error();
      // optimistic update
      setRows((r) =>
        r.map((tx) =>
          tx.id === editing.id
            ? {
                ...tx,
                type: editing.type,
                amountUzs: editing.amountUzs.replace(/[\s ]/g, ""),
                categoryId: editing.categoryId || null,
                categoryName:
                  categories.find((c) => c.id === editing.categoryId)?.name ?? null,
                categoryEmoji:
                  categories.find((c) => c.id === editing.categoryId)?.emoji ?? null,
                note: editing.note || null,
                occurredAt: new Date(editing.occurredAt + "T00:00:00+05:00").toISOString(),
              }
            : tx
        )
      );
      setEditing(null);
      showToast(t("transactions.updated", lang));
      router.refresh();
    } catch {
      setEditError(t("error.generic", lang));
    } finally {
      setEditLoading(false);
    }
  };

  const inputCls =
    "rounded-lg px-3 py-2 text-sm transition-all focus:outline-none focus:ring-2 min-h-[40px]";
  const inputStyle = {
    border: "1px solid var(--color-border)",
    background: "var(--color-surface)",
    color: "var(--color-text-primary)",
  };

  const hasFilters = typeFilter || catFilter || searchQuery || dateFrom || dateTo;

  return (
    <>
      {toast && (
        <Toast message={toast.msg} type={toast.type} onDone={() => setToast(null)} />
      )}

      {/* Filters bar */}
      <div
        className="rounded-xl p-4 space-y-3"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        {/* Row 1: type + category + search */}
        <div className="flex flex-wrap gap-2">
          {/* Type pills */}
          <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--color-border)" }}>
            {(["", "income", "expense"] as const).map((v) => (
              <button
                key={v || "all"}
                onClick={() => { setTypeFilter(v); setPage(1); }}
                className="px-3 py-1.5 text-xs font-semibold transition-all min-h-[36px]"
                style={
                  typeFilter === v
                    ? { background: "var(--color-brand)", color: "#fff" }
                    : { background: "transparent", color: "var(--color-text-secondary)" }
                }
              >
                {v === ""
                  ? t("transactions.filter.all", lang)
                  : t(`transactions.filter.${v}`, lang)}
              </button>
            ))}
          </div>

          {/* Category */}
          <select
            value={catFilter}
            onChange={(e) => { setCatFilter(e.target.value); setPage(1); }}
            className={`${inputCls} pr-8`}
            style={{ ...inputStyle, minWidth: 130 }}
          >
            <option value="">{t("transactions.filter.category", lang)}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji ? `${c.emoji} ` : ""}{c.name}
              </option>
            ))}
          </select>

          {/* Search */}
          <input
            type="text"
            placeholder={t("transactions.filter.search", lang)}
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            className={`${inputCls} flex-1 min-w-[140px]`}
            style={inputStyle}
          />
        </div>

        {/* Row 2: date range + reset */}
        <div className="flex flex-wrap gap-2 items-center">
          <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            {t("transactions.filter.from", lang)}
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className={inputCls}
            style={inputStyle}
          />
          <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            {t("transactions.filter.to", lang)}
          </label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className={inputCls}
            style={inputStyle}
          />
          {hasFilters && (
            <button
              onClick={resetFilters}
              className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all min-h-[36px]"
              style={{ background: "var(--color-expense-bg)", color: "var(--color-expense)" }}
            >
              {t("transactions.filter.reset", lang)}
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div
        className="rounded-xl shadow-sm overflow-hidden"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        {filtered.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <div className="text-4xl">🔍</div>
            <p className="font-medium" style={{ color: "var(--color-text-secondary)" }}>
              {t("transactions.no_results", lang)}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ background: "#F8FAFC", borderBottom: "1px solid var(--color-border)" }}>
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-xs" style={{ color: "var(--color-text-muted)" }}>
                    {t("transactions.date", lang)}
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-xs" style={{ color: "var(--color-text-muted)" }}>
                    {t("transactions.type", lang)}
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-xs" style={{ color: "var(--color-text-muted)" }}>
                    {t("transactions.category", lang)}
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-xs" style={{ color: "var(--color-text-muted)" }}>
                    {t("transactions.amount", lang)}
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-xs hidden sm:table-cell" style={{ color: "var(--color-text-muted)" }}>
                    {t("transactions.note", lang)}
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-xs" style={{ color: "var(--color-text-muted)" }}>
                    {t("transactions.actions", lang)}
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((tx, idx) => (
                  <tr
                    key={tx.id}
                    className="group transition-colors"
                    style={{
                      background: idx % 2 === 0 ? "var(--color-surface)" : "#FAFAFA",
                      borderTop: "1px solid var(--color-border)",
                    }}
                  >
                    <td
                      className="px-4 py-3 whitespace-nowrap text-sm"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {formatDate(tx.occurredAt, lang)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={
                          tx.type === "income"
                            ? { background: "var(--color-income-bg)", color: "var(--color-income)" }
                            : { background: "var(--color-expense-bg)", color: "var(--color-expense)" }
                        }
                      >
                        {t(`form.type.${tx.type}`, lang)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                      {tx.categoryEmoji ? `${tx.categoryEmoji} ` : ""}
                      {tx.categoryName ?? "—"}
                    </td>
                    <td
                      className="px-4 py-3 text-right font-semibold tabular whitespace-nowrap"
                      style={{ color: tx.type === "income" ? "var(--color-income)" : "var(--color-expense)" }}
                    >
                      {tx.type === "income" ? "+" : "−"}{formatMoney(tx.amountUzs)} so'm
                    </td>
                    <td
                      className="px-4 py-3 text-xs hidden sm:table-cell"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {tx.note ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEdit(tx)}
                          className="p-1.5 rounded-lg transition-all min-h-[36px] min-w-[36px] flex items-center justify-center"
                          style={{ color: "var(--color-brand)" }}
                          title={t("common.edit", lang)}
                          aria-label={t("common.edit", lang)}
                        >
                          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(tx.id)}
                          disabled={deletingId === tx.id}
                          className="p-1.5 rounded-lg transition-all min-h-[36px] min-w-[36px] flex items-center justify-center disabled:opacity-40"
                          style={{ color: "var(--color-expense)" }}
                          title={t("common.delete", lang)}
                          aria-label={t("common.delete", lang)}
                        >
                          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div
            className="flex items-center justify-between px-4 py-3 border-t"
            style={{ borderColor: "var(--color-border)" }}
          >
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              {t("transactions.page", lang)} {page} {t("transactions.of", lang)} {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all min-h-[36px] disabled:opacity-40"
                style={{ border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}
              >
                {t("common.prev", lang)}
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all min-h-[36px] disabled:opacity-40"
                style={{ border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}
              >
                {t("common.next", lang)}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(15,23,42,0.5)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setEditing(null); }}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6 space-y-4 shadow-2xl"
            style={{ background: "var(--color-surface)" }}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base" style={{ color: "var(--color-text-primary)" }}>
                {t("transactions.edit.title", lang)}
              </h3>
              <button
                onClick={() => setEditing(null)}
                className="p-1.5 rounded-lg transition-all"
                style={{ color: "var(--color-text-muted)" }}
              >
                ✕
              </button>
            </div>

            {editError && (
              <div
                className="text-sm px-3 py-2 rounded-lg"
                style={{ background: "var(--color-expense-bg)", color: "var(--color-expense)" }}
              >
                {editError}
              </div>
            )}

            {/* Type */}
            <div className="flex gap-2">
              {(["income", "expense"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setEditing((s) => s ? { ...s, type: opt, categoryId: "" } : s)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all"
                  style={
                    editing.type === opt
                      ? opt === "income"
                        ? { background: "var(--color-income)", color: "#fff" }
                        : { background: "var(--color-expense)", color: "#fff" }
                      : { background: "#F1F5F9", color: "var(--color-text-secondary)" }
                  }
                >
                  {t(`form.type.${opt}`, lang)}
                </button>
              ))}
            </div>

            {/* Amount */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-secondary)" }}>
                {t("form.amount", lang)}
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={formatMoney(editing.amountUzs)}
                onChange={(e) => setEditing((s) => s ? { ...s, amountUzs: e.target.value.replace(/\s/g, "") } : s)}
                className="w-full rounded-lg px-3 py-2.5 text-sm tabular"
                style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)" }}
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-secondary)" }}>
                {t("form.category", lang)}
              </label>
              <select
                value={editing.categoryId}
                onChange={(e) => setEditing((s) => s ? { ...s, categoryId: e.target.value } : s)}
                className="w-full rounded-lg px-3 py-2.5 text-sm"
                style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)" }}
              >
                <option value="">{t("form.category_none", lang)}</option>
                {categories.filter((c) => c.type === editing.type).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.emoji ? `${c.emoji} ` : ""}{c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-secondary)" }}>
                {t("form.date", lang)}
              </label>
              <input
                type="date"
                value={editing.occurredAt}
                onChange={(e) => setEditing((s) => s ? { ...s, occurredAt: e.target.value } : s)}
                className="w-full rounded-lg px-3 py-2.5 text-sm"
                style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)" }}
              />
            </div>

            {/* Note */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-secondary)" }}>
                {t("form.note", lang)}
              </label>
              <input
                type="text"
                value={editing.note}
                onChange={(e) => setEditing((s) => s ? { ...s, note: e.target.value } : s)}
                className="w-full rounded-lg px-3 py-2.5 text-sm"
                style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)" }}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setEditing(null)}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all"
                style={{ border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}
              >
                {t("common.cancel", lang)}
              </button>
              <button
                onClick={handleEditSave}
                disabled={editLoading}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-60"
                style={{ background: "var(--color-brand)", color: "#fff" }}
              >
                {editLoading ? t("form.submitting", lang) : t("common.save", lang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
