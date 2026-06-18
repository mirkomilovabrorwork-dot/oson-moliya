"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { LangCode } from "@/lib/i18n/translate";
import { t } from "@/lib/i18n/translate";
import { Toast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { BulkDeleteDialog } from "@/components/BulkDeleteDialog";
import type { DisplayCurrency, Rates } from "@/lib/rates";
import { formatMoney as formatMoneyFn } from "@/lib/currency";

// Local interface — amountUzs is serialized as string by serializeBigInt
interface DebtRow {
  id: string;
  counterparty: string;
  amountUzs: string;
  direction: "given" | "taken";
  status: "open" | "settled";
  note: string | null;
  occurredAt: string;
  settledAt: string | null;
  paidUzs: string;
}

interface DebtTotals {
  givenOpen: string;
  takenOpen: string;
}

interface Props {
  debts: DebtRow[];
  totals: DebtTotals;
  lang: LangCode;
  currency: DisplayCurrency;
  rates: Rates;
}

type Tab = "all" | "given" | "taken";

// formatMoney is defined as instance method inside DebtsClient (currency-aware)

function formatDate(iso: string | null | undefined, lang: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const locale = lang === "ru" ? "ru-RU" : lang === "en" ? "en-GB" : "uz-Latn-UZ";
  return d.toLocaleDateString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const inputStyle = {
  border: "1px solid var(--border)",
  background: "var(--surface-elevated)",
  color: "var(--fg)",
};
const inputCls =
  "w-full rounded-[12px] px-3 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 min-h-[44px]";

export function DebtsClient({ debts: initial, totals: initialTotals, lang, currency, rates }: Props) {
  const router = useRouter();
  const formatMoney = (s: string) =>
    formatMoneyFn(BigInt(Math.round(Math.abs(Number(s)))), currency, rates, lang);
  const [debts, setDebts] = useState<DebtRow[]>(initial);
  const [totals, setTotals] = useState<DebtTotals>(initialTotals);
  const [tab, setTab] = useState<Tab>("all");
  const [toast, setToast] = useState<{
    msg: string;
    type: "success" | "error";
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addCounterparty, setAddCounterparty] = useState("");
  const [addAmount, setAddAmount] = useState("");
  const [addDirection, setAddDirection] = useState<"given" | "taken">("given");
  const [addNote, setAddNote] = useState("");
  // A4: Initialize to "" to avoid SSR/client mismatch; set today on mount via useEffect.
  const [addDate, setAddDate] = useState("");

  // Edit form
  const [editTarget, setEditTarget] = useState<DebtRow | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editCounterparty, setEditCounterparty] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editDate, setEditDate] = useState("");

  // Action loading
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Single-item delete dialog
  const [deleteDialogDebt, setDeleteDialogDebt] = useState<DebtRow | null>(null);

  // Bulk select mode
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Action sheet
  const [actionSheetDebt, setActionSheetDebt] = useState<DebtRow | null>(null);

  // Add-payment form
  const [paymentTarget, setPaymentTarget] = useState<DebtRow | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // A4: Set today's date on mount (client-side only) to avoid SSR/hydration mismatch.
  useEffect(() => {
    setAddDate(new Date().toISOString().slice(0, 10));
  }, []);

  // ── Action sheet: pushState for device/Telegram back support ─────────────
  const openActionSheet = useCallback((debt: DebtRow) => {
    setActionSheetDebt(debt);
    window.history.pushState({ debtActionSheet: true }, "");
  }, []);

  const closeActionSheet = useCallback(() => {
    setActionSheetDebt(null);
    // If our pushed history state is still on top, pop it so back-button stays consistent.
    if (typeof window !== "undefined" && window.history.state?.debtActionSheet) {
      window.history.back();
    }
  }, []);

  useEffect(() => {
    const handler = () => {
      if (actionSheetDebt) {
        setActionSheetDebt(null);
      }
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [actionSheetDebt]);

  const showToast = (
    msg: string,
    type: "success" | "error" = "success",
    actionLabel?: string,
    onAction?: () => void
  ) => setToast({ msg, type, actionLabel, onAction });

  // Refetch totals from API
  const refreshTotals = useCallback(async () => {
    try {
      const res = await fetch("/api/debts?totals=1");
      if (res.ok) {
        const data = await res.json() as DebtTotals;
        setTotals(data);
      }
    } catch {
      // non-critical
    }
  }, []);

  const handleAdd = useCallback(async () => {
    if (!addCounterparty.trim() || !addAmount.trim()) return;
    setAddLoading(true);
    setAddError(null);
    try {
      const res = await fetch("/api/debts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          counterparty: addCounterparty.trim(),
          amountUzs: addAmount.replace(/\s/g, ""),
          direction: addDirection,
          note: addNote.trim() || null,
          occurredAt: addDate ? new Date(addDate).toISOString() : null,
        }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json() as DebtRow;
      setDebts((prev) => [created, ...prev]);
      setAddCounterparty("");
      setAddAmount("");
      setAddNote("");
      setAddDate(new Date().toISOString().slice(0, 10));
      setShowAdd(false);
      showToast(t("debt.saved", lang));
      await refreshTotals();
      router.refresh();
    } catch {
      setAddError(t("error.generic", lang));
    } finally {
      setAddLoading(false);
    }
  }, [addCounterparty, addAmount, addDirection, addNote, addDate, lang, router, refreshTotals]);

  const openEdit = useCallback((debt: DebtRow) => {
    setEditTarget(debt);
    setEditCounterparty(debt.counterparty);
    setEditAmount(debt.amountUzs);
    setEditNote(debt.note ?? "");
    setEditDate(debt.occurredAt.slice(0, 10));
    setEditError(null);
  }, []);

  const handleEdit = useCallback(async () => {
    if (!editTarget) return;
    setEditLoading(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/debts/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          counterparty: editCounterparty.trim(),
          amountUzs: editAmount.replace(/\s/g, ""),
          note: editNote.trim() || null,
          occurredAt: editDate ? new Date(editDate).toISOString() : undefined,
        }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json() as DebtRow;
      setDebts((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      setEditTarget(null);
      showToast(t("debt.saved", lang));
      await refreshTotals();
      router.refresh();
    } catch {
      setEditError(t("error.generic", lang));
    } finally {
      setEditLoading(false);
    }
  }, [editTarget, editCounterparty, editAmount, editNote, editDate, lang, router, refreshTotals]);

  const handleSettle = useCallback(
    async (id: string) => {
      setSettlingId(id);
      try {
        const res = await fetch(`/api/debts/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "settled" }),
        });
        if (!res.ok) throw new Error();
        const updated = await res.json() as DebtRow;
        setDebts((prev) => prev.map((d) => (d.id === id ? updated : d)));
        showToast(t("debt.settled", lang));
        await refreshTotals();
        router.refresh();
      } catch {
        showToast(t("error.generic", lang), "error");
      } finally {
        setSettlingId(null);
      }
    },
    [lang, router, refreshTotals]
  );

  const handleDelete = useCallback(
    async () => {
      if (!deleteDialogDebt) return;
      const id = deleteDialogDebt.id;
      const deleted = deleteDialogDebt;
      setDeletingId(id);
      try {
        const res = await fetch(`/api/debts/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error();
        setDebts((prev) => prev.filter((d) => d.id !== id));
        setDeleteDialogDebt(null);
        showToast(
          t("debt.deleted", lang),
          "success",
          t("undo.action", lang),
          async () => {
            try {
              await fetch(`/api/debts/${id}/restore`, { method: "POST" });
              setDebts((prev) => [deleted, ...prev]);
              showToast(t("undo.restored", lang));
              await refreshTotals();
              router.refresh();
            } catch {
              showToast(t("error.generic", lang), "error");
            }
          }
        );
        await refreshTotals();
        router.refresh();
      } catch {
        showToast(t("error.generic", lang), "error");
      } finally {
        setDeletingId(null);
      }
    },
    [deleteDialogDebt, lang, router, refreshTotals]
  );

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    const deletedIds = Array.from(selectedIds);
    const deletedRows = debts.filter((d) => selectedIds.has(d.id));
    try {
      await Promise.all(
        deletedIds.map((id) =>
          fetch(`/api/debts/${id}`, { method: "DELETE" })
        )
      );
      setDebts((prev) => prev.filter((d) => !selectedIds.has(d.id)));
      const n = deletedIds.length;
      setBulkDialogOpen(false);
      setSelectedIds(new Set());
      setSelectMode(false);
      showToast(
        t("bulk.deleted_toast", lang).replace("{n}", String(n)),
        "success",
        t("undo.action", lang),
        async () => {
          try {
            await Promise.all(
              deletedIds.map((id) =>
                fetch(`/api/debts/${id}/restore`, { method: "POST" })
              )
            );
            setDebts((prev) => [...deletedRows, ...prev]);
            showToast(t("undo.restored", lang));
            await refreshTotals();
            router.refresh();
          } catch {
            showToast(t("error.generic", lang), "error");
          }
        }
      );
      await refreshTotals();
      router.refresh();
    } catch {
      showToast(t("error.generic", lang), "error");
    } finally {
      setBulkDeleting(false);
    }
  }, [selectedIds, debts, lang, router, refreshTotals]);

  const openPaymentModal = useCallback((debt: DebtRow) => {
    setPaymentTarget(debt);
    setPaymentAmount("");
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentNote("");
    setPaymentError(null);
  }, []);

  const handleAddPayment = useCallback(async () => {
    if (!paymentTarget || !paymentAmount.trim()) return;

    // Client-side: check amount does not exceed remaining
    const originalAmt = BigInt(paymentTarget.amountUzs);
    const paidAmt = BigInt(paymentTarget.paidUzs);
    const remaining = originalAmt - paidAmt;
    const enteredAmt = BigInt(paymentAmount.replace(/\s/g, "").replace(/\D/g, "") || "0");
    if (enteredAmt <= 0n || enteredAmt > remaining) {
      setPaymentError(t("debt.payment.exceeds", lang));
      return;
    }

    setPaymentLoading(true);
    setPaymentError(null);
    try {
      const res = await fetch(`/api/debts/${paymentTarget.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountUzs: paymentAmount.replace(/\s/g, ""),
          occurredAt: paymentDate ? new Date(paymentDate).toISOString() : new Date().toISOString(),
          note: paymentNote.trim() || null,
        }),
      });
      if (!res.ok) {
        const errData = await res.json() as { error?: string };
        if (errData.error?.includes("remaining") || errData.error?.includes("EXCEEDS")) {
          setPaymentError(t("debt.payment.exceeds", lang));
        } else {
          setPaymentError(t("error.generic", lang));
        }
        return;
      }
      setPaymentTarget(null);
      showToast(t("debt.payment.saved", lang));
      router.refresh();
    } catch {
      setPaymentError(t("error.generic", lang));
    } finally {
      setPaymentLoading(false);
    }
  }, [paymentTarget, paymentAmount, paymentDate, paymentNote, lang, router]);

  const visible = debts.filter((d) => {
    if (tab === "given") return d.direction === "given";
    if (tab === "taken") return d.direction === "taken";
    return true;
  });

  const tabs: { key: Tab; label: string }[] = [
    { key: "all", label: t("debt.tab.all", lang) },
    { key: "given", label: t("debt.tab.given", lang) },
    { key: "taken", label: t("debt.tab.taken", lang) },
  ];

  return (
    <>
      {toast && (
        <Toast
          message={toast.msg}
          type={toast.type}
          onDone={() => setToast(null)}
          actionLabel={toast.actionLabel}
          onAction={toast.onAction}
        />
      )}

      {/* Single-item delete dialog */}
      <ConfirmDialog
        open={Boolean(deleteDialogDebt)}
        title={t("confirm.delete_title", lang)}
        message={
          deleteDialogDebt
            ? t("confirm.delete_one", lang).replace("{item}", deleteDialogDebt.counterparty)
            : ""
        }
        confirmLabel={t("confirm.delete", lang)}
        cancelLabel={t("confirm.cancel", lang)}
        danger
        loading={Boolean(deletingId)}
        onCancel={() => { if (!deletingId) setDeleteDialogDebt(null); }}
        onConfirm={handleDelete}
      />

      {/* Bulk delete dialog */}
      <BulkDeleteDialog
        open={bulkDialogOpen}
        count={selectedIds.size}
        itemsPreview={debts
          .filter((d) => selectedIds.has(d.id))
          .map((d) => `${d.counterparty} · ${formatMoney(d.amountUzs)}`)}
        loading={bulkDeleting}
        lang={lang}
        onConfirm={handleBulkDelete}
        onCancel={() => setBulkDialogOpen(false)}
      />

      {/* Add modal */}
      {showAdd && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(15,23,42,0.5)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAdd(false);
          }}
        >
          <div
            className="w-full max-w-sm rounded-[16px] p-6 space-y-4"
            style={{ background: "var(--surface-elevated)", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)" }}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base" style={{ color: "var(--fg)" }}>
                {t("debt.add", lang)}
              </h3>
              <button
                onClick={() => setShowAdd(false)}
                className="p-1.5 rounded-lg"
                style={{ color: "var(--fg-subtle)" }}
              >
                ✕
              </button>
            </div>

            {addError && (
              <div
                className="text-sm px-3 py-2 rounded-[12px]"
                style={{ background: "var(--expense-wash)", color: "var(--expense)" }}
              >
                {addError}
              </div>
            )}

            {/* Direction toggle */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--fg-muted)" }}>
                {t("debt.direction", lang)}
              </label>
              <div className="flex rounded-[12px] p-1 gap-1" style={{ background: "var(--surface-sunken)" }}>
                {(["given", "taken"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setAddDirection(d)}
                    className="flex-1 py-2 rounded-[10px] text-xs font-semibold transition-all min-h-[44px]"
                    style={
                      addDirection === d
                        ? {
                            background: "var(--surface)",
                            color: d === "given" ? "var(--income)" : "var(--expense)",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                          }
                        : { color: "var(--fg-subtle)" }
                    }
                  >
                    {d === "given" ? t("debt.tab.given", lang) : t("debt.tab.taken", lang)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--fg-muted)" }}>
                {t("debt.counterparty", lang)}
              </label>
              <input
                autoFocus
                type="text"
                value={addCounterparty}
                onChange={(e) => setAddCounterparty(e.target.value)}
                className={inputCls}
                style={inputStyle}
                placeholder={t("debt.counterparty_placeholder", lang)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--fg-muted)" }}>
                {t("debt.amount", lang)}
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={addAmount}
                onChange={(e) => setAddAmount(e.target.value)}
                className={inputCls}
                style={inputStyle}
                placeholder={t("debt.amount_placeholder", lang)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--fg-muted)" }}>
                {t("debt.date", lang)}
              </label>
              <input
                type="date"
                value={addDate}
                onChange={(e) => setAddDate(e.target.value)}
                className={inputCls}
                style={inputStyle}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--fg-muted)" }}>
                {t("debt.note", lang)}
              </label>
              <input
                type="text"
                value={addNote}
                onChange={(e) => setAddNote(e.target.value)}
                className={inputCls}
                style={inputStyle}
                placeholder={t("debt.note_placeholder", lang)}
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowAdd(false)}
                className="flex-1 py-2.5 rounded-[12px] text-sm font-semibold"
                style={{ border: "1px solid var(--border)", color: "var(--fg-muted)" }}
              >
                {t("common.cancel", lang)}
              </button>
              <button
                onClick={handleAdd}
                disabled={addLoading || !addCounterparty.trim() || !addAmount.trim()}
                className="flex-1 py-2.5 rounded-[12px] text-sm font-semibold disabled:opacity-60"
                style={{ background: "var(--accent-gradient)", color: "#fff", boxShadow: "var(--shadow-sm)" }}
              >
                {addLoading ? t("form.submitting", lang) : t("common.save", lang)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(15,23,42,0.5)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditTarget(null);
          }}
        >
          <div
            className="w-full max-w-sm rounded-[16px] p-6 space-y-4"
            style={{ background: "var(--surface-elevated)", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)" }}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base" style={{ color: "var(--fg)" }}>
                {t("debt.edit.title", lang)}
              </h3>
              <button
                onClick={() => setEditTarget(null)}
                className="p-1.5 rounded-lg"
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

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--fg-muted)" }}>
                {t("debt.counterparty", lang)}
              </label>
              <input
                autoFocus
                type="text"
                value={editCounterparty}
                onChange={(e) => setEditCounterparty(e.target.value)}
                className={inputCls}
                style={inputStyle}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--fg-muted)" }}>
                {t("debt.amount", lang)}
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                className={inputCls}
                style={inputStyle}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--fg-muted)" }}>
                {t("debt.date", lang)}
              </label>
              <input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className={inputCls}
                style={inputStyle}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--fg-muted)" }}>
                {t("debt.note", lang)}
              </label>
              <input
                type="text"
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                className={inputCls}
                style={inputStyle}
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setEditTarget(null)}
                className="flex-1 py-2.5 rounded-[12px] text-sm font-semibold"
                style={{ border: "1px solid var(--border)", color: "var(--fg-muted)" }}
              >
                {t("common.cancel", lang)}
              </button>
              <button
                onClick={handleEdit}
                disabled={editLoading || !editCounterparty.trim() || !editAmount.trim()}
                className="flex-1 py-2.5 rounded-[12px] text-sm font-semibold disabled:opacity-60"
                style={{ background: "var(--accent-gradient)", color: "#fff", boxShadow: "var(--shadow-sm)" }}
              >
                {editLoading ? t("form.submitting", lang) : t("common.save", lang)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add-payment modal */}
      {paymentTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(15,23,42,0.5)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setPaymentTarget(null);
          }}
        >
          <div
            className="w-full max-w-sm rounded-[16px] p-6 space-y-4"
            style={{ background: "var(--surface-elevated)", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)" }}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base" style={{ color: "var(--fg)" }}>
                {paymentTarget.direction === "given" ? t("debt.return.title", lang) : t("debt.repay.title", lang)}
              </h3>
              <button
                onClick={() => setPaymentTarget(null)}
                className="p-1.5 rounded-lg"
                style={{ color: "var(--fg-subtle)" }}
              >
                ✕
              </button>
            </div>

            {/* Remaining hint */}
            {(() => {
              const orig = BigInt(paymentTarget.amountUzs);
              const paid = BigInt(paymentTarget.paidUzs);
              const rem = orig - paid;
              return (
                <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
                  {t("debt.remaining", lang)}: {formatMoney(String(rem > 0n ? rem : 0n))} UZS
                </p>
              );
            })()}

            {paymentError && (
              <div
                className="text-sm px-3 py-2 rounded-[12px]"
                style={{ background: "var(--expense-wash)", color: "var(--expense)" }}
              >
                {paymentError}
              </div>
            )}

            {/* "Hammasi" — PRIMARY one-tap full repayment (most debts are repaid in full).
                Full-width accent button showing the remaining amount; fills the input. */}
            {(() => {
              const orig = BigInt(paymentTarget.amountUzs);
              const paid = BigInt(paymentTarget.paidUzs);
              const rem = orig - paid;
              const remStr = String(rem > 0n ? rem : 0n);
              const isAll = paymentAmount.replace(/\s/g, "").replace(/\D/g, "") === remStr;
              return (
                <button
                  type="button"
                  onClick={() => setPaymentAmount(remStr)}
                  className="w-full py-3 rounded-[12px] text-sm font-bold transition-all flex items-center justify-center gap-2"
                  style={
                    isAll
                      ? { background: "var(--accent-gradient)", color: "#fff", boxShadow: "var(--shadow-sm)" }
                      : { background: "var(--accent-wash)", color: "var(--accent)", border: "1.5px solid var(--accent)" }
                  }
                >
                  {isAll ? "✓ " : "↩️ "}
                  {t("debt.payment.all", lang)} · {formatMoney(remStr)}
                </button>
              );
            })()}

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--fg-muted)" }}>
                {t("debt.payment.partial_label", lang)}
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className={inputCls}
                style={inputStyle}
                placeholder={t("debt.amount_placeholder", lang)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--fg-muted)" }}>
                {t("debt.payment.date_label", lang)}
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className={inputCls}
                style={inputStyle}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--fg-muted)" }}>
                {t("debt.note", lang)}
              </label>
              <input
                type="text"
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                className={inputCls}
                style={inputStyle}
                placeholder={t("debt.note_placeholder", lang)}
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setPaymentTarget(null)}
                className="flex-1 py-2.5 rounded-[12px] text-sm font-semibold"
                style={{ border: "1px solid var(--border)", color: "var(--fg-muted)" }}
              >
                {t("common.cancel", lang)}
              </button>
              <button
                onClick={handleAddPayment}
                disabled={paymentLoading || !paymentAmount.trim()}
                className="flex-1 py-2.5 rounded-[12px] text-sm font-semibold disabled:opacity-60"
                style={{ background: "var(--accent-gradient)", color: "#fff", boxShadow: "var(--shadow-sm)" }}
              >
                {paymentLoading ? t("form.submitting", lang) : t("common.save", lang)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Debt explainer — one-liner so users know debts aren't counted in income/expense */}
      <p className="text-xs mb-4" style={{ color: "var(--fg-subtle)" }}>
        {t("debt.explainer", lang)}
      </p>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {/* Given (lent out) — neutral; money-lent is an asset-at-risk, not income */}
        <div
          className="rounded-[var(--radius-lg)] p-4"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
        >
          <p className="text-xs font-medium mb-1" style={{ color: "var(--fg-subtle)" }}>
            {t("debt.given", lang)}
          </p>
          <p className="text-xl font-bold tabular-nums" style={{ color: "var(--fg)" }}>
            {formatMoney(totals.givenOpen)}
          </p>
        </div>
        {/* Taken (borrowed) */}
        <div
          className="rounded-[var(--radius-lg)] p-4"
          style={{ background: "var(--expense-wash)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
        >
          <p className="text-xs font-medium mb-1" style={{ color: "var(--expense)" }}>
            {t("debt.taken", lang)}
          </p>
          <p className="text-xl font-bold tabular-nums" style={{ color: "var(--expense)" }}>
            {formatMoney(totals.takenOpen)}
          </p>
        </div>
      </div>

      {/* Header row: tabs + Tanlash toggle */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {/* Segmented tabs */}
        <div
          className="flex rounded-[12px] p-1 gap-1"
          style={{ background: "var(--surface-sunken)", display: "inline-flex" }}
        >
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="px-4 py-1.5 rounded-[10px] text-sm font-semibold transition-all min-h-[44px]"
              style={
                tab === key
                  ? {
                      background: "var(--surface)",
                      color: "var(--fg)",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                    }
                  : { color: "var(--fg-subtle)" }
              }
            >
              {label}
            </button>
          ))}
        </div>

        {/* Select mode toggle */}
        {visible.length > 0 && (
          <button
            onClick={() => {
              setSelectMode((v) => !v);
              setSelectedIds(new Set());
            }}
            className="ml-auto px-3.5 py-2 rounded-full text-xs font-semibold min-h-[44px] transition-all"
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

      {/* Sticky bulk action bar */}
      {selectMode && selectedIds.size > 0 && (
        <div
          className="sticky top-0 z-40 flex items-center gap-3 px-4 py-3 rounded-[12px] mb-3"
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

      {/* Debt list */}
      <div
        className="rounded-[var(--radius-lg)] overflow-hidden"
        style={{ background: "var(--surface-elevated)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
      >
        {visible.length === 0 ? (
          <div className="px-5 py-12 text-center space-y-2">
            <div
              className="mx-auto w-12 h-12 rounded-xl flex items-center justify-center mb-3"
              style={{ background: "var(--surface-sunken)" }}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ color: "var(--fg-subtle)" }}
              >
                <path d="M20 12V22H4V12" />
                <path d="M22 7H2v5h20V7z" />
                <path d="M12 22V7" />
                <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
                <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
              </svg>
            </div>
            <p className="text-sm font-medium" style={{ color: "var(--fg-muted)" }}>
              {t("debt.empty", lang)}
            </p>
            <p className="text-xs" style={{ color: "var(--fg-subtle)" }}>
              {t("debt.empty.hint", lang)}
            </p>
          </div>
        ) : (
          <div>
            {visible.map((debt, idx) => {
              const isSettled = debt.status === "settled";
              const isGiven = debt.direction === "given";
              const paidUzs = BigInt(debt.paidUzs ?? "0");
              const origUzs = BigInt(debt.amountUzs);
              const remainingUzs = origUzs - paidUzs;
              const hasPartialPayment = !isSettled && paidUzs > 0n;
              return (
                <div
                  key={debt.id}
                  className="w-full flex items-center gap-3 px-5 py-4 text-left"
                  style={{
                    borderTop: idx === 0 ? undefined : "1px solid var(--border)",
                    opacity: isSettled ? 0.6 : 1,
                    minHeight: "64px",
                  }}
                >
                  {/* Checkbox in select mode */}
                  {selectMode && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(debt.id)}
                      onChange={(e) => {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(debt.id); else next.delete(debt.id);
                          return next;
                        });
                      }}
                      style={{ accentColor: "var(--expense)", width: 18, height: 18, flexShrink: 0 }}
                      aria-label={debt.counterparty}
                    />
                  )}

                  {/* Direction icon — clicking opens action sheet (hidden in select mode) */}
                  {!selectMode && (
                    <button
                      onClick={() => openActionSheet(debt)}
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold"
                      style={{
                        background: isGiven ? "var(--income-wash)" : "var(--expense-wash)",
                        color: isGiven ? "var(--income)" : "var(--expense)",
                      }}
                      aria-label={t("debt.edit.title", lang)}
                    >
                      {isGiven ? "↑" : "↓"}
                    </button>
                  )}

                  {/* Main content — clicking opens action sheet (or toggles selection) */}
                  <button
                    onClick={() => {
                      if (selectMode) {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(debt.id)) next.delete(debt.id); else next.add(debt.id);
                          return next;
                        });
                      } else {
                        openActionSheet(debt);
                      }
                    }}
                    className="row-hover flex-1 min-w-0 text-left transition-colors"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <p
                        className="font-semibold text-sm"
                        style={{
                          color: "var(--fg)",
                          textDecoration: isSettled ? "line-through" : "none",
                        }}
                      >
                        {debt.counterparty}
                      </p>
                      {isSettled && (
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: "var(--surface-sunken)", color: "var(--fg-subtle)" }}
                        >
                          {t("debt.status.settled", lang)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: "var(--fg-subtle)" }}>
                      {isGiven ? t("debt.tab.given", lang) : t("debt.tab.taken", lang)}
                      {" · "}
                      {formatDate(debt.occurredAt, lang)}
                      {debt.note ? ` · ${debt.note}` : ""}
                    </p>
                    {/* Fix F: two short lines — remaining emphasized, orig·paid muted below */}
                    {hasPartialPayment && (
                      <div className="mt-0.5">
                        <p className="text-xs font-semibold" style={{ color: "var(--fg)" }}>
                          {t("debt.remaining", lang)}: {formatMoney(String(remainingUzs > 0n ? remainingUzs : 0n))}
                        </p>
                        <p className="text-xs" style={{ color: "var(--fg-subtle)" }}>
                          {t("debt.original", lang)} {formatMoney(debt.amountUzs)}
                          {" · "}
                          {t("debt.paid", lang)} {formatMoney(String(paidUzs))}
                        </p>
                      </div>
                    )}
                  </button>

                  {/* Right side: amount + optional "+ To'lov" button */}
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <button
                      onClick={() => openActionSheet(debt)}
                      className="text-right"
                    >
                      {/* Fix G: given-debt amount neutral (var(--fg)), not green */}
                      <p
                        className="font-bold text-sm tabular-nums"
                        style={{ color: isGiven ? "var(--fg)" : "var(--expense)" }}
                      >
                        {isGiven ? "+" : "−"}{hasPartialPayment ? formatMoney(String(remainingUzs > 0n ? remainingUzs : 0n)) : formatMoney(debt.amountUzs)}
                      </p>
                    </button>
                    {!isSettled && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openPaymentModal(debt);
                        }}
                        className="text-xs px-2 py-1 rounded-[8px] font-medium transition-colors"
                        style={{
                          background: "var(--surface-sunken)",
                          color: "var(--accent)",
                          border: "1px solid var(--border)",
                          minHeight: "28px",
                        }}
                      >
                        {isGiven ? t("debt.mark_returned", lang) : t("debt.mark_repaid", lang)}
                      </button>
                    )}
                  </div>

                  {/* Chevron affordance */}
                  <button
                    onClick={() => openActionSheet(debt)}
                    className="shrink-0 text-base leading-none select-none ml-1"
                    style={{ color: "var(--fg-subtle)" }}
                    aria-hidden="true"
                    tabIndex={-1}
                  >
                    ›
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Action sheet ── */}
      {actionSheetDebt && (
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
              <div className="flex items-center gap-3">
                <span
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-sm font-bold"
                  style={{
                    background: actionSheetDebt.direction === "given" ? "var(--income-wash)" : "var(--expense-wash)",
                    color: actionSheetDebt.direction === "given" ? "var(--income)" : "var(--expense)",
                  }}
                >
                  {actionSheetDebt.direction === "given" ? "↑" : "↓"}
                </span>
                <div>
                  <p className="font-semibold text-sm" style={{ color: "var(--fg)" }}>
                    {actionSheetDebt.counterparty}
                  </p>
                  <p className="text-xs" style={{ color: "var(--fg-subtle)" }}>
                    {actionSheetDebt.direction === "given" ? "+" : "−"}{formatMoney(actionSheetDebt.amountUzs)}
                  </p>
                </div>
              </div>
              <button
                onClick={closeActionSheet}
                className="p-2 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
                style={{ color: "var(--fg-subtle)" }}
                aria-label={t("common.close", lang)}
              >
                ✕
              </button>
            </div>

            {/* Actions */}
            <div className="py-2">
              {/* Settle — only for open debts */}
              {actionSheetDebt.status === "open" && (
                <button
                  onClick={() => {
                    closeActionSheet();
                    void handleSettle(actionSheetDebt.id);
                  }}
                  disabled={settlingId === actionSheetDebt.id}
                  className="w-full flex items-center gap-4 px-5 min-h-[52px] transition-colors disabled:opacity-40"
                  style={{ color: "var(--fg)" }}
                >
                  <span
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: "var(--income-wash)" }}
                  >
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style={{ color: "var(--income)" }}>
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </span>
                  <span className="text-sm font-medium">{t("debt.settle", lang)}</span>
                </button>
              )}

              {/* Edit — only for open debts */}
              {actionSheetDebt.status === "open" && (
                <button
                  onClick={() => {
                    openEdit(actionSheetDebt);
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
              )}

              {/* Add payment — only for open debts */}
              {actionSheetDebt.status === "open" && (
                <button
                  onClick={() => {
                    openPaymentModal(actionSheetDebt);
                    closeActionSheet();
                  }}
                  className="w-full flex items-center gap-4 px-5 min-h-[52px] transition-colors"
                  style={{ color: "var(--fg)" }}
                >
                  <span
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: "var(--surface-sunken)" }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 8v8M8 12h8" />
                    </svg>
                  </span>
                  <span className="text-sm font-medium">{t("debt.add_payment", lang)}</span>
                </button>
              )}

              {/* Delete */}
              <button
                onClick={() => {
                  closeActionSheet();
                  setDeleteDialogDebt(actionSheetDebt);
                }}
                disabled={deletingId === actionSheetDebt.id}
                className="w-full flex items-center gap-4 px-5 min-h-[52px] transition-colors disabled:opacity-40"
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

      {/* ── Context-aware FAB (pill with text label on /debts) ── */}
      <style>{`
        .debts-fab {
          bottom: calc(env(safe-area-inset-bottom, 0px) + 92px);
          right: 1.35rem;
        }
        @media (min-width: 640px) {
          .debts-fab {
            bottom: 2rem;
            right: 2rem;
          }
        }
      `}</style>
      <button
        aria-label={t("debt.add", lang)}
        onClick={() => setShowAdd(true)}
        className="debts-fab fixed z-50 flex items-center gap-2 px-5 h-14 rounded-full transition-transform active:scale-95"
        style={{
          background: "var(--accent-gradient)",
          color: "#ffffff",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        <span className="text-sm font-semibold">{t("debt.add", lang)}</span>
      </button>
    </>
  );
}
