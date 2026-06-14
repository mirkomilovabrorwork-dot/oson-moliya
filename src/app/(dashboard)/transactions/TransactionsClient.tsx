"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { LangCode } from "@/lib/i18n/translate";
import { t } from "@/lib/i18n/translate";
import { Toast } from "@/components/Toast";
import { TypedDeleteDialog } from "@/components/TypedDeleteDialog";
import type { DisplayCurrency, Rates } from "@/lib/rates";
import { formatMoney as formatMoneyFn, formatTxMoney as formatTxMoneyFn } from "@/lib/currency";

interface TxRow {
  id: string;
  type: "income" | "expense";
  amountUzs: string;
  originalCurrency: string | null;
  originalAmount: string | null;
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
  currency: DisplayCurrency;
  rates: Rates;
}

const PAGE_SIZE = 20;

// formatMoney is defined as an instance function inside TransactionsClient (currency-aware)

// Deterministic date formatter — same output on server and client (no Intl locale dependency).
// Month names sourced inline; do NOT move to shared helpers or dictionaries.
const MONTHS: Record<string, string[]> = {
  uz: ["yan", "fev", "mar", "apr", "may", "iyun", "iyul", "avg", "sen", "okt", "noy", "dek"],
  ru: ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

function toTashkentParts(iso: string): { y: number; m: number; d: number } {
  // Add +5h offset to convert UTC to Tashkent (UTC+5). No DST in Tashkent.
  const utcMs = new Date(iso).getTime();
  const tashkentMs = utcMs + 5 * 60 * 60 * 1000;
  const dt = new Date(tashkentMs);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate() };
}

function formatDate(iso: string, lang: string): string {
  const { y, m, d } = toTashkentParts(iso);
  const key = lang === "ru" ? "ru" : lang === "en" ? "en" : "uz";
  const mon = MONTHS[key][m];
  const dd = String(d).padStart(2, "0");
  return `${dd} ${mon} ${y}`;
}

// Derive "YYYY-MM-DD" in Tashkent timezone from an ISO string — used for filter boundary.
function toTashkentDateStr(iso: string): string {
  const { y, m, d } = toTashkentParts(iso);
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

interface EditState {
  id: string;
  type: "income" | "expense";
  amountUzs: string;
  categoryId: string;
  note: string;
  occurredAt: string;
}

export function TransactionsClient({ transactions: initial, categories, lang, currency, rates }: Props) {
  const router = useRouter();
  // formatMoney: for aggregated totals (always uses amountUzs, converts to chosen main currency)
  const formatMoney = (s: string) =>
    formatMoneyFn(BigInt(Math.round(Number(s))), currency, rates, lang);
  // formatTxMoney: for individual transaction rows — always shows the row's own currency
  const formatTxMoney = (tx: TxRow) =>
    formatTxMoneyFn(
      {
        amountUzs: BigInt(Math.round(Number(tx.amountUzs))),
        originalCurrency: tx.originalCurrency,
        originalAmount: tx.originalAmount != null ? BigInt(tx.originalAmount) : null,
      },
      currency,
      rates,
      lang
    );

  // Filter state
  const [typeFilter, setTypeFilter] = useState<"" | "income" | "expense">("");
  const [catFilter, setCatFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  // Date panel toggle
  const [showDatePanel, setShowDatePanel] = useState(false);

  // Live rows (optimistic delete/edit)
  const [rows, setRows] = useState<TxRow[]>(initial);

  // Edit modal state
  const [editing, setEditing] = useState<EditState | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TxRow | null>(null);

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
    if (dateFrom || dateTo) {
      r = r.filter((tx) => {
        const tashkentDate = toTashkentDateStr(tx.occurredAt);
        if (dateFrom && tashkentDate < dateFrom) return false;
        if (dateTo && tashkentDate > dateTo) return false;
        return true;
      });
    }
    return r;
  }, [rows, typeFilter, catFilter, searchQuery, dateFrom, dateTo]);

  // Summary totals for the active filter
  const summaryIncome = useMemo(
    () => filtered.filter((tx) => tx.type === "income").reduce((s, tx) => s + Number(tx.amountUzs), 0),
    [filtered]
  );
  const summaryExpense = useMemo(
    () => filtered.filter((tx) => tx.type === "expense").reduce((s, tx) => s + Number(tx.amountUzs), 0),
    [filtered]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pagedRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const resetFilters = () => {
    setTypeFilter("");
    setCatFilter("");
    setSearchQuery("");
    setDateFrom("");
    setDateTo("");
    setShowDatePanel(false);
    setPage(1);
  };

  // Delete handler
  const handleDelete = useCallback(
    async () => {
      if (!deleteTarget) return;
      const id = deleteTarget.id;
      setDeletingId(id);
      try {
        const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error();
        setRows((r) => r.filter((tx) => tx.id !== id));
        setDeleteTarget(null);
        showToast(t("transactions.deleted", lang));
        router.refresh();
      } catch {
        showToast(t("error.generic", lang), "error");
      } finally {
        setDeletingId(null);
      }
    },
    [deleteTarget, lang, router]
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

  const inputStyle = {
    border: "1px solid var(--border-strong)",
    background: "transparent",
    color: "var(--fg)",
  };

  const hasFilters = typeFilter || catFilter || searchQuery || dateFrom || dateTo;
  const hasDateFilter = dateFrom || dateTo;

  // Selected category label for chip
  const catLabel = catFilter
    ? categories.find((c) => c.id === catFilter)?.name ?? t("transactions.filter.category", lang)
    : t("transactions.filter.category", lang);

  return (
    <>
      {toast && (
        <Toast message={toast.msg} type={toast.type} onDone={() => setToast(null)} />
      )}

      <TypedDeleteDialog
        open={Boolean(deleteTarget)}
        title={t("delete.typed.title", lang)}
        warning={t("delete.typed.warning", lang)}
        description={t("transactions.delete.confirm", lang)}
        targetLabel={
          deleteTarget
            ? `${deleteTarget.type === "income" ? "+" : "-"}${formatTxMoney(deleteTarget)} · ${
                deleteTarget.categoryName ?? t("form.category_none", lang)
              }`
            : undefined
        }
        requiredWord={t("delete.typed.word", lang)}
        inputLabel={t("delete.typed.input_label", lang)}
        instruction={t("delete.typed.instruction", lang)}
        confirmLabel={t("common.delete", lang)}
        cancelLabel={t("common.cancel", lang)}
        loading={Boolean(deletingId)}
        onCancel={() => {
          if (!deletingId) setDeleteTarget(null);
        }}
        onConfirm={handleDelete}
      />

      {/* ── Rounded search ── */}
      <div className="relative">
        <span
          className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: "var(--fg-subtle)" }}
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
              clipRule="evenodd"
            />
          </svg>
        </span>
        <input
          type="text"
          placeholder={t("transactions.filter.search", lang)}
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
          className="w-full h-11 pl-11 pr-4 text-sm transition-all focus:outline-none focus:ring-2"
          style={{
            ...inputStyle,
            borderRadius: "12px",
            background: "var(--surface-sunken)",
            border: "1px solid var(--border)",
          }}
        />
      </div>

      {/* ── Chip filters ── */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Type chips — v3: selected = accent-wash bg + accent border + accent text */}
        {(["", "income", "expense"] as const).map((v) => (
          <button
            key={v || "all"}
            onClick={() => { setTypeFilter(v); setPage(1); }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium transition-all min-h-[44px]"
            style={
              typeFilter === v
                ? { background: "var(--accent-wash)", color: "var(--accent)", border: "1px solid var(--accent)" }
                : { background: "transparent", color: "var(--fg-muted)", border: "1px solid var(--border-strong)" }
            }
          >
            {v === "" ? t("transactions.filter.all", lang) : t(`transactions.filter.${v}`, lang)}
          </button>
        ))}

        {/* Category chip with caret */}
        <div className="relative">
          <select
            value={catFilter}
            onChange={(e) => { setCatFilter(e.target.value); setPage(1); }}
            className="appearance-none pl-3.5 pr-8 py-2 rounded-full text-xs font-medium min-h-[44px] transition-all cursor-pointer"
            style={
              catFilter
                ? { background: "var(--accent-wash)", color: "var(--accent)", border: "1px solid var(--accent)" }
                : { background: "transparent", color: "var(--fg-muted)", border: "1px solid var(--border-strong)" }
            }
          >
            <option value="">{t("transactions.filter.category", lang)}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji ? `${c.emoji} ` : ""}{c.name}
              </option>
            ))}
          </select>
          <span
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
            style={{ color: catFilter ? "var(--accent)" : "var(--fg-subtle)" }}
          >
            <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd"/>
            </svg>
          </span>
        </div>

        {/* Date chip with caret */}
        <button
          onClick={() => setShowDatePanel((v) => !v)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium transition-all min-h-[44px]"
          style={
            hasDateFilter
              ? { background: "var(--accent-wash)", color: "var(--accent)", border: "1px solid var(--accent)" }
              : { background: "transparent", color: "var(--fg-muted)", border: "1px solid var(--border-strong)" }
          }
        >
          {hasDateFilter
            ? `${dateFrom || "…"} → ${dateTo || "…"}`
            : t("transactions.filter.period", lang)}
          <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd"/>
          </svg>
        </button>

        {/* Reset chip */}
        {hasFilters && (
          <button
            onClick={resetFilters}
            className="flex items-center gap-1 px-3.5 py-2 rounded-full text-xs font-semibold transition-all min-h-[44px]"
            style={{ background: "var(--expense-wash)", color: "var(--expense)" }}
          >
            ✕ {t("transactions.filter.reset", lang)}
          </button>
        )}
      </div>

      {/* Date panel (collapsible) */}
      {showDatePanel && (
        <div
          className="flex flex-wrap gap-3 items-center px-4 py-3 rounded-[12px]"
          style={{ background: "var(--surface-sunken)", border: "1px solid var(--border)" }}
        >
          <label className="text-xs font-medium" style={{ color: "var(--fg-subtle)" }}>
            {t("transactions.filter.from", lang)}
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="rounded-[10px] px-3 py-2 text-sm min-h-[44px] focus:outline-none"
            style={inputStyle}
          />
          <label className="text-xs font-medium" style={{ color: "var(--fg-subtle)" }}>
            {t("transactions.filter.to", lang)}
          </label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="rounded-[10px] px-3 py-2 text-sm min-h-[44px] focus:outline-none"
            style={inputStyle}
          />
        </div>
      )}

      {/* ── Summary cards — v3: neutral bg, colored NUMBER only ── */}
      <div className="grid grid-cols-2 gap-3">
        <div
          className="rounded-md px-4 py-4 space-y-1"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <p
            className="text-xs font-medium uppercase tracking-wide"
            style={{ color: "var(--fg-subtle)" }}
          >
            {t("transactions.summary.income", lang)}
          </p>
          <p
            className="text-lg font-semibold tabular"
            style={{ color: "var(--income)" }}
          >
            +{formatMoney(String(summaryIncome))}
          </p>
        </div>
        <div
          className="rounded-md px-4 py-4 space-y-1"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <p
            className="text-xs font-medium uppercase tracking-wide"
            style={{ color: "var(--fg-subtle)" }}
          >
            {t("transactions.summary.expense", lang)}
          </p>
          <p
            className="text-lg font-semibold tabular"
            style={{ color: "var(--expense)" }}
          >
            −{formatMoney(String(summaryExpense))}
          </p>
        </div>
      </div>

      {/* ── Transaction list ── */}
      <div
        className="rounded-[12px] overflow-hidden"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        {filtered.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div
              className="mx-auto w-12 h-12 rounded-xl flex items-center justify-center mb-2"
              style={{ background: "var(--surface-sunken)" }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--fg-subtle)" }}>
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </div>
            <p className="font-medium" style={{ color: "var(--fg-muted)" }}>
              {t("transactions.no_results", lang)}
            </p>
            {hasFilters && (
              <button
                onClick={resetFilters}
                className="text-xs px-4 py-2 rounded-full font-medium transition-all"
                style={{ background: "var(--surface-sunken)", color: "var(--fg-muted)" }}
              >
                {t("transactions.filter.reset", lang)}
              </button>
            )}
          </div>
        ) : (
          <>
          <div className="sm:hidden divide-y" style={{ borderColor: "var(--border)" }}>
            {pagedRows.map((tx) => (
              <div
                key={tx.id}
                className="row-hover flex items-center gap-3 px-4 py-3.5 transition-colors"
              >
                <span
                  className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0 text-sm"
                  style={{
                    background: "var(--surface-sunken)",
                    color: "var(--fg-muted)",
                  }}
                  aria-hidden="true"
                >
                  {tx.categoryEmoji ?? (tx.type === "income" ? "+" : "-")}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <p
                      className="text-sm font-medium truncate"
                      style={{ color: "var(--fg)" }}
                    >
                      {tx.categoryName ?? t("form.category_none", lang)}
                    </p>
                    <span
                      className="text-[11px] font-medium shrink-0"
                      style={{
                        color:
                          tx.type === "income"
                            ? "var(--income)"
                            : "var(--expense)",
                      }}
                    >
                      {t(`form.type.${tx.type}`, lang)}
                    </span>
                  </div>
                  <p className="text-xs truncate" style={{ color: "var(--fg-subtle)" }}>
                    {formatDate(tx.occurredAt, lang)}
                    {tx.note ? ` · ${tx.note}` : ""}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span
                    className="text-sm font-semibold tabular whitespace-nowrap"
                    style={{
                      color:
                        tx.type === "income"
                          ? "var(--income)"
                          : "var(--expense)",
                    }}
                  >
                    {tx.type === "income" ? "+" : "−"}
                    {formatTxMoney(tx)}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEdit(tx)}
                      className="w-11 h-11 rounded-[10px] flex items-center justify-center"
                      style={{ color: "var(--accent)" }}
                      aria-label={t("common.edit", lang)}
                      title={t("common.edit", lang)}
                    >
                      <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setDeleteTarget(tx)}
                      disabled={deletingId === tx.id}
                      className="w-11 h-11 rounded-[10px] flex items-center justify-center disabled:opacity-40"
                      style={{ color: "var(--expense)" }}
                      aria-label={t("common.delete", lang)}
                      title={t("common.delete", lang)}
                    >
                      <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead
                style={{
                  background: "var(--surface-sunken)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <tr>
                  <th
                    className="px-4 py-3 text-left font-medium text-xs"
                    style={{ color: "var(--fg-subtle)" }}
                  >
                    {t("transactions.date", lang)}
                  </th>
                  <th
                    className="px-4 py-3 text-left font-medium text-xs"
                    style={{ color: "var(--fg-subtle)" }}
                  >
                    {t("transactions.type", lang)}
                  </th>
                  <th
                    className="px-4 py-3 text-left font-medium text-xs"
                    style={{ color: "var(--fg-subtle)" }}
                  >
                    {t("transactions.category", lang)}
                  </th>
                  <th
                    className="px-4 py-3 text-right font-medium text-xs"
                    style={{ color: "var(--fg-subtle)" }}
                  >
                    {t("transactions.amount", lang)}
                  </th>
                  <th
                    className="px-4 py-3 text-left font-medium text-xs hidden sm:table-cell"
                    style={{ color: "var(--fg-subtle)" }}
                  >
                    {t("transactions.note", lang)}
                  </th>
                  <th
                    className="px-4 py-3 text-right font-medium text-xs"
                    style={{ color: "var(--fg-subtle)" }}
                  >
                    {t("transactions.actions", lang)}
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((tx) => (
                  <tr
                    key={tx.id}
                    className="row-hover group transition-colors"
                    style={{
                      borderTop: "1px solid var(--border)",
                    }}
                  >
                    <td
                      className="px-4 py-3.5 whitespace-nowrap text-sm"
                      style={{ color: "var(--fg-muted)" }}
                    >
                      {formatDate(tx.occurredAt, lang)}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className="text-xs font-medium"
                        style={{
                          color:
                            tx.type === "income"
                              ? "var(--income)"
                              : "var(--expense)",
                        }}
                      >
                        {t(`form.type.${tx.type}`, lang)}
                      </span>
                    </td>
                    <td
                      className="px-4 py-3.5 text-sm"
                      style={{ color: "var(--fg-muted)" }}
                    >
                      {tx.categoryEmoji ? `${tx.categoryEmoji} ` : ""}
                      {tx.categoryName ?? "—"}
                    </td>
                    <td
                      className="px-4 py-3.5 text-right font-semibold tabular whitespace-nowrap"
                      style={{
                        color:
                          tx.type === "income"
                            ? "var(--income)"
                            : "var(--expense)",
                      }}
                    >
                      {tx.type === "income" ? "+" : "−"}
                      {formatTxMoney(tx)}
                    </td>
                    <td
                      className="px-4 py-3.5 text-xs hidden sm:table-cell"
                      style={{ color: "var(--fg-subtle)" }}
                    >
                      {tx.note ?? "—"}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEdit(tx)}
                          className="p-1.5 rounded-[10px] transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
                          style={{ color: "var(--accent)" }}
                          title={t("common.edit", lang)}
                          aria-label={t("common.edit", lang)}
                        >
                          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setDeleteTarget(tx)}
                          disabled={deletingId === tx.id}
                          className="p-1.5 rounded-[10px] transition-all min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-40"
                          style={{ color: "var(--expense)" }}
                          title={t("common.delete", lang)}
                          aria-label={t("common.delete", lang)}
                        >
                          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                            <path
                              fillRule="evenodd"
                              d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div
            className="flex items-center justify-between px-4 py-3 border-t"
            style={{ borderColor: "var(--border)" }}
          >
            <p className="text-xs" style={{ color: "var(--fg-subtle)" }}>
              {t("transactions.page", lang)} {page} {t("transactions.of", lang)} {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 rounded-full text-xs font-medium transition-all min-h-[44px] disabled:opacity-40"
                style={{
                  border: "1px solid var(--border)",
                  color: "var(--fg-muted)",
                }}
              >
                {t("common.prev", lang)}
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-full text-xs font-medium transition-all min-h-[44px] disabled:opacity-40"
                style={{
                  border: "1px solid var(--border)",
                  color: "var(--fg-muted)",
                }}
              >
                {t("common.next", lang)}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Edit modal ── */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(15,23,42,0.5)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditing(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-[12px] p-6 space-y-4"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base" style={{ color: "var(--fg)" }}>
                {t("transactions.edit.title", lang)}
              </h3>
              <button
                onClick={() => setEditing(null)}
                className="p-1.5 rounded-lg transition-all"
                style={{ color: "var(--fg-subtle)" }}
              >
                ✕
              </button>
            </div>

            {editError && (
              <div
                className="text-sm px-3 py-2 rounded-[12px]"
                style={{ background: "var(--expense-wash)", color: "var(--expense)" }}
              >
                {editError}
              </div>
            )}

            {/* Type — segmented: active = raised neutral, NOT income/expense fill */}
            <div
              className="flex rounded-md p-0.5 gap-0.5"
              style={{ background: "var(--surface-sunken)" }}
            >
              {(["income", "expense"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() =>
                    setEditing((s) => (s ? { ...s, type: opt, categoryId: "" } : s))
                  }
                  className="flex-1 py-2 rounded-[8px] text-sm font-medium transition-all"
                  style={
                    editing.type === opt
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
                value={editing.amountUzs}
                onChange={(e) =>
                  setEditing((s) =>
                    s ? { ...s, amountUzs: e.target.value.replace(/\s/g, "") } : s
                  )
                }
                className="w-full rounded-[12px] px-3 py-2.5 text-sm tabular"
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
                value={editing.categoryId}
                onChange={(e) =>
                  setEditing((s) => (s ? { ...s, categoryId: e.target.value } : s))
                }
                className="w-full rounded-[12px] px-3 py-2.5 text-sm"
                style={inputStyle}
              >
                <option value="">{t("form.category_none", lang)}</option>
                {categories
                  .filter((c) => c.type === editing.type)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.emoji ? `${c.emoji} ` : ""}
                      {c.name}
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
                value={editing.occurredAt}
                onChange={(e) =>
                  setEditing((s) => (s ? { ...s, occurredAt: e.target.value } : s))
                }
                className="w-full rounded-[12px] px-3 py-2.5 text-sm"
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
                value={editing.note}
                onChange={(e) =>
                  setEditing((s) => (s ? { ...s, note: e.target.value } : s))
                }
                className="w-full rounded-[12px] px-3 py-2.5 text-sm"
                style={inputStyle}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setEditing(null)}
                className="flex-1 py-2.5 rounded-[12px] text-sm font-semibold transition-all"
                style={{
                  border: "1px solid var(--border)",
                  color: "var(--fg-muted)",
                }}
              >
                {t("common.cancel", lang)}
              </button>
              <button
                onClick={handleEditSave}
                disabled={editLoading}
                className="flex-1 py-2.5 rounded-[12px] text-sm font-semibold transition-all disabled:opacity-60"
                style={{ background: "var(--accent)", color: "#fff" }}
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
