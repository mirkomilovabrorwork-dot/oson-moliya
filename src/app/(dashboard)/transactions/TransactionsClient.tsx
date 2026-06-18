"use client";

import { useState, useMemo, useCallback, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { LangCode } from "@/lib/i18n/translate";
import { t } from "@/lib/i18n/translate";
import { Toast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { BulkDeleteDialog } from "@/components/BulkDeleteDialog";
import type { DisplayCurrency, Rates } from "@/lib/rates";
import { formatMoney as formatMoneyFn, formatTxMoney as formatTxMoneyFn } from "@/lib/currency";
import { translateCategoryName } from "@/lib/categories-i18n";

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

function TransactionsClientInner({ transactions: initial, categories, lang, currency, rates }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

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

  // Helper: read a validated "income"|"expense"|"" from URL param
  function readTypeParam(p: URLSearchParams): "" | "income" | "expense" {
    const v = p.get("type") ?? "";
    return v === "income" || v === "expense" ? v : "";
  }

  // Filter state — initialized from URL on first render
  const [typeFilter, setTypeFilter] = useState<"" | "income" | "expense">(() => readTypeParam(searchParams));
  const [catFilter, setCatFilter] = useState(() => searchParams.get("cat") ?? "");
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("q") ?? "");
  const [dateFrom, setDateFrom] = useState(() => searchParams.get("from") ?? "");
  const [dateTo, setDateTo] = useState(() => searchParams.get("to") ?? "");
  const [page, setPage] = useState(1);

  // Date panel toggle — open automatically if a date filter is present in URL
  const [showDatePanel, setShowDatePanel] = useState(() => !!(searchParams.get("from") || searchParams.get("to")));

  // Debounced search ref: avoids janky URL updates while typing
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync non-search filters to URL immediately; search is debounced
  useEffect(() => {
    const params = new URLSearchParams();
    if (typeFilter) params.set("type", typeFilter);
    if (catFilter) params.set("cat", catFilter);
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    // Search is handled separately in its own debounced effect below
    if (searchQuery) params.set("q", searchQuery);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, catFilter, dateFrom, dateTo]);

  // Debounce search query URL update (300 ms)
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      const params = new URLSearchParams();
      if (typeFilter) params.set("type", typeFilter);
      if (catFilter) params.set("cat", catFilter);
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      if (searchQuery) params.set("q", searchQuery);
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    }, 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  // Live rows (optimistic delete/edit)
  const [rows, setRows] = useState<TxRow[]>(initial);

  // Edit modal state
  const [editing, setEditing] = useState<EditState | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TxRow | null>(null);

  // Bulk select state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Action sheet state — which transaction is open
  const [actionSheetTx, setActionSheetTx] = useState<TxRow | null>(null);

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
  };

  // ── Action sheet: pushState for device/Telegram back support ──────────────
  const openActionSheet = useCallback((tx: TxRow) => {
    setActionSheetTx(tx);
    window.history.pushState({ actionSheet: true }, "");
  }, []);

  const closeActionSheet = useCallback(() => {
    setActionSheetTx(null);
  }, []);

  useEffect(() => {
    const handler = (e: PopStateEvent) => {
      if (actionSheetTx) {
        e.preventDefault?.();
        setActionSheetTx(null);
      }
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [actionSheetTx]);

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
    router.replace("?", { scroll: false });
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

  // Bulk delete handler
  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) =>
          fetch(`/api/transactions/${id}`, { method: "DELETE" })
        )
      );
      const n = selectedIds.size;
      setRows((r) => r.filter((tx) => !selectedIds.has(tx.id)));
      setBulkDialogOpen(false);
      setSelectedIds(new Set());
      setSelectMode(false);
      showToast(t("bulk.deleted_toast", lang).replace("{n}", String(n)));
      router.refresh();
    } catch {
      showToast(t("error.generic", lang), "error");
    } finally {
      setBulkDeleting(false);
    }
  }, [selectedIds, lang, router]);

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
    border: "1px solid var(--border)",
    background: "var(--surface-elevated)",
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

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t("confirm.delete_title", lang)}
        message={
          deleteTarget
            ? t("confirm.delete_one", lang).replace(
                "{item}",
                `${deleteTarget.type === "income" ? "+" : "−"}${formatTxMoney(deleteTarget)} · ${
                  translateCategoryName(deleteTarget.categoryName, lang) ?? t("form.category_none", lang)
                }`
              )
            : ""
        }
        confirmLabel={t("confirm.delete", lang)}
        cancelLabel={t("confirm.cancel", lang)}
        danger
        loading={Boolean(deletingId)}
        onCancel={() => {
          if (!deletingId) setDeleteTarget(null);
        }}
        onConfirm={handleDelete}
      />

      <BulkDeleteDialog
        open={bulkDialogOpen}
        count={selectedIds.size}
        itemsPreview={rows
          .filter((tx) => selectedIds.has(tx.id))
          .map((tx) => `${tx.type === "income" ? "+" : "−"}${formatTxMoney(tx)} · ${
            translateCategoryName(tx.categoryName, lang) ?? t("form.category_none", lang)
          }`)}
        loading={bulkDeleting}
        lang={lang}
        onConfirm={handleBulkDelete}
        onCancel={() => setBulkDialogOpen(false)}
      />

      {/* ── Transaction action sheet ── */}
      {actionSheetTx && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          style={{ background: "rgba(15,23,42,0.5)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeActionSheet();
          }}
        >
          <div
            className="w-full max-w-sm rounded-t-[20px] sm:rounded-[16px] overflow-hidden"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            {/* Sheet header */}
            <div
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0 text-sm"
                  style={{ background: "var(--surface-sunken)", color: "var(--fg-muted)" }}
                >
                  {actionSheetTx.categoryEmoji ?? (actionSheetTx.type === "income" ? "+" : "−")}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate" style={{ color: "var(--fg)" }}>
                    {translateCategoryName(actionSheetTx.categoryName, lang) ?? t("form.category_none", lang)}
                    {" · "}
                    <span style={{ color: actionSheetTx.type === "income" ? "var(--income)" : "var(--expense)" }}>
                      {actionSheetTx.type === "income" ? "+" : "−"}{formatTxMoney(actionSheetTx)}
                    </span>
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--fg-subtle)" }}>
                    {formatDate(actionSheetTx.occurredAt, lang)}
                    {actionSheetTx.note ? ` · ${actionSheetTx.note}` : ""}
                  </p>
                </div>
              </div>
              <button
                onClick={closeActionSheet}
                className="p-2 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
                style={{ color: "var(--fg-subtle)" }}
                aria-label={t("common.close", lang)}
              >
                ✕
              </button>
            </div>

            {/* Actions */}
            <div className="py-2">
              {/* Edit action */}
              <button
                onClick={() => {
                  openEdit(actionSheetTx);
                  closeActionSheet();
                }}
                className="w-full flex items-center gap-4 px-5 min-h-[52px] transition-colors"
                style={{ color: "var(--fg)" }}
              >
                <span
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "var(--surface-sunken)" }}
                >
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style={{ color: "var(--accent)" }}>
                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                  </svg>
                </span>
                <span className="text-sm font-medium">{t("common.edit", lang)}</span>
              </button>

              {/* Delete action */}
              <button
                onClick={() => {
                  setDeleteTarget(actionSheetTx);
                  closeActionSheet();
                }}
                className="w-full flex items-center gap-4 px-5 min-h-[52px] transition-colors"
              >
                <span
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "var(--expense-wash)" }}
                >
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style={{ color: "var(--expense)" }}>
                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </span>
                <span className="text-sm font-medium" style={{ color: "var(--expense)" }}>
                  {t("common.delete", lang)}
                </span>
              </button>
            </div>

            {/* Safe-area bottom padding for iOS */}
            <div style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }} />
          </div>
        </div>
      )}

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
            borderRadius: "var(--radius-md)",
            background: "var(--surface-sunken)",
            border: "1px solid var(--border)",
          }}
        />
      </div>

      {/* ── Bulk action bar (shown when items selected) ── */}
      {selectMode && selectedIds.size > 0 && (
        <div
          className="sticky top-0 z-40 flex items-center gap-3 px-4 py-3 rounded-[12px]"
          style={{ background: "var(--surface-elevated)", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)" }}
        >
          <span className="flex-1 text-sm font-semibold" style={{ color: "var(--fg)" }}>
            {t("bulk.selected_count", lang).replace("{n}", String(selectedIds.size))}
          </span>
          <button
            onClick={() => { setSelectedIds(new Set()); setSelectMode(false); }}
            className="px-3 py-1.5 rounded-full text-xs font-medium"
            style={{ border: "1px solid var(--border)", color: "var(--fg-muted)" }}
          >
            {t("bulk.cancel", lang)}
          </button>
          <button
            onClick={() => setBulkDialogOpen(true)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{ background: "var(--expense)", color: "#fff" }}
          >
            {t("bulk.delete", lang)}
          </button>
        </div>
      )}

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
                {c.emoji ? `${c.emoji} ` : ""}{translateCategoryName(c.name, lang)}
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

        {/* Tanlash toggle */}
        {filtered.length > 0 && (
          <button
            onClick={() => {
              setSelectMode((v) => !v);
              setSelectedIds(new Set());
            }}
            className="ml-auto flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium transition-all min-h-[44px]"
            style={
              selectMode
                ? { background: "var(--accent-wash)", color: "var(--accent)", border: "1px solid var(--accent)" }
                : { background: "transparent", color: "var(--fg-muted)", border: "1px solid var(--border-strong)" }
            }
          >
            {t("bulk.select", lang)}
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div
          className="rounded-[var(--radius-lg)] px-4 py-4 space-y-1"
          style={{ background: "var(--surface-elevated)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
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
          className="rounded-[var(--radius-lg)] px-4 py-4 space-y-1"
          style={{ background: "var(--surface-elevated)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
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
        className="rounded-[var(--radius-lg)] overflow-hidden"
        style={{ background: "var(--surface-elevated)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
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
          <div className="sm:hidden">
            {pagedRows.map((tx, idx) => (
              <button
                key={tx.id}
                onClick={() => {
                  if (selectMode) {
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(tx.id)) next.delete(tx.id); else next.add(tx.id);
                      return next;
                    });
                  } else {
                    openActionSheet(tx);
                  }
                }}
                className="row-hover w-full flex items-center gap-3 px-4 py-3.5 transition-colors text-left"
                style={{ borderTop: idx === 0 ? undefined : "1px solid var(--border)", minHeight: "64px" }}
              >
                {selectMode && (
                  <input
                    type="checkbox"
                    readOnly
                    checked={selectedIds.has(tx.id)}
                    style={{ accentColor: "var(--expense)", width: 18, height: 18, flexShrink: 0 }}
                    aria-hidden="true"
                  />
                )}
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
                      {translateCategoryName(tx.categoryName, lang) ?? t("form.category_none", lang)}
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
                  <span
                    className="text-base leading-none select-none"
                    style={{ color: "var(--fg-subtle)" }}
                    aria-hidden="true"
                  >
                    ›
                  </span>
                </div>
              </button>
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
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((tx) => (
                  <tr
                    key={tx.id}
                    onClick={() => {
                      if (selectMode) {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(tx.id)) next.delete(tx.id); else next.add(tx.id);
                          return next;
                        });
                      } else {
                        openActionSheet(tx);
                      }
                    }}
                    className="row-hover transition-colors cursor-pointer"
                    style={{
                      borderTop: "1px solid var(--border)",
                      background: selectMode && selectedIds.has(tx.id) ? "var(--expense-wash)" : undefined,
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
                      {translateCategoryName(tx.categoryName, lang) ?? "—"}
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
            // Do not close during save — prevents modal freezing mid-PATCH
            if (!editLoading && e.target === e.currentTarget) setEditing(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-[12px] p-6 space-y-4"
            style={{ background: "var(--surface-elevated)", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)" }}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base" style={{ color: "var(--fg)" }}>
                {t("transactions.edit.title", lang)}
              </h3>
              <button
                onClick={() => { if (!editLoading) setEditing(null); }}
                disabled={editLoading}
                className="p-1.5 rounded-lg transition-all disabled:opacity-40"
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
              style={{ background: "var(--surface-sunken)", opacity: editLoading ? 0.5 : 1 }}
            >
              {(["income", "expense"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  disabled={editLoading}
                  onClick={() =>
                    setEditing((s) => (s ? { ...s, type: opt, categoryId: "" } : s))
                  }
                  className="flex-1 py-2 rounded-[8px] text-sm font-medium transition-all disabled:cursor-not-allowed"
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
                disabled={editLoading}
                value={editing.amountUzs}
                onChange={(e) =>
                  setEditing((s) =>
                    s ? { ...s, amountUzs: e.target.value.replace(/\s/g, "") } : s
                  )
                }
                className="w-full rounded-[12px] px-3 py-2.5 text-sm tabular disabled:opacity-50 disabled:cursor-not-allowed"
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
                disabled={editLoading}
                value={editing.categoryId}
                onChange={(e) =>
                  setEditing((s) => (s ? { ...s, categoryId: e.target.value } : s))
                }
                className="w-full rounded-[12px] px-3 py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                style={inputStyle}
              >
                <option value="">{t("form.category_none", lang)}</option>
                {categories
                  .filter((c) => c.type === editing.type)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.emoji ? `${c.emoji} ` : ""}
                      {translateCategoryName(c.name, lang)}
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
                disabled={editLoading}
                value={editing.occurredAt}
                onChange={(e) =>
                  setEditing((s) => (s ? { ...s, occurredAt: e.target.value } : s))
                }
                className="w-full rounded-[12px] px-3 py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
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
                disabled={editLoading}
                value={editing.note}
                onChange={(e) =>
                  setEditing((s) => (s ? { ...s, note: e.target.value } : s))
                }
                className="w-full rounded-[12px] px-3 py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                style={inputStyle}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { if (!editLoading) setEditing(null); }}
                disabled={editLoading}
                className="flex-1 py-2.5 rounded-[12px] text-sm font-semibold transition-all disabled:opacity-40"
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
                className="flex-1 py-2.5 rounded-[12px] text-sm font-semibold transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ background: "var(--accent-gradient)", color: "#fff", boxShadow: "var(--shadow-sm)" }}
              >
                {editLoading && (
                  <svg
                    className="animate-spin"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  >
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                )}
                {editLoading ? t("form.submitting", lang) : t("common.save", lang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function TransactionsClient(props: Props) {
  return (
    <Suspense>
      <TransactionsClientInner {...props} />
    </Suspense>
  );
}
