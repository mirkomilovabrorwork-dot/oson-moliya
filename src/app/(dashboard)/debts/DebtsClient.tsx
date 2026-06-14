"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { LangCode } from "@/lib/i18n/translate";
import { t } from "@/lib/i18n/translate";
import { Toast } from "@/components/Toast";

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
}

interface DebtTotals {
  givenOpen: string;
  takenOpen: string;
}

interface Props {
  debts: DebtRow[];
  totals: DebtTotals;
  lang: LangCode;
}

type Tab = "all" | "given" | "taken";

function formatMoney(s: string): string {
  const n = Number(s);
  if (isNaN(n)) return s;
  const parts: string[] = [];
  let rem = Math.abs(Math.round(n));
  if (rem === 0) return "0";
  while (rem >= 1000) {
    parts.unshift(String(rem % 1000).padStart(3, "0"));
    rem = Math.floor(rem / 1000);
  }
  parts.unshift(String(rem));
  return parts.join(" ");
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("uz-Latn-UZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const inputStyle = {
  border: "1px solid var(--border-strong)",
  background: "transparent",
  color: "var(--fg)",
};
const inputCls =
  "w-full rounded-[12px] px-3 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 min-h-[44px]";

export function DebtsClient({ debts: initial, totals: initialTotals, lang }: Props) {
  const router = useRouter();
  const [debts, setDebts] = useState<DebtRow[]>(initial);
  const [totals, setTotals] = useState<DebtTotals>(initialTotals);
  const [tab, setTab] = useState<Tab>("all");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addCounterparty, setAddCounterparty] = useState("");
  const [addAmount, setAddAmount] = useState("");
  const [addDirection, setAddDirection] = useState<"given" | "taken">("given");
  const [addNote, setAddNote] = useState("");
  const [addDate, setAddDate] = useState(() => new Date().toISOString().slice(0, 10));

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

  const showToast = (msg: string, type: "success" | "error" = "success") =>
    setToast({ msg, type });

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
    setEditAmount(formatMoney(debt.amountUzs));
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
      if (!confirm(t("debt.settle", lang) + "?")) return;
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
    async (id: string) => {
      if (!confirm(t("debt.delete.confirm", lang))) return;
      setDeletingId(id);
      try {
        const res = await fetch(`/api/debts/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error();
        setDebts((prev) => prev.filter((d) => d.id !== id));
        showToast(t("debt.deleted", lang));
        await refreshTotals();
        router.refresh();
      } catch {
        showToast(t("error.generic", lang), "error");
      } finally {
        setDeletingId(null);
      }
    },
    [lang, router, refreshTotals]
  );

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
      {toast && <Toast message={toast.msg} type={toast.type} onDone={() => setToast(null)} />}

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
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
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
                    className="flex-1 py-2 rounded-[10px] text-xs font-semibold transition-all min-h-[36px]"
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
                placeholder="Ali, Baraka LLC..."
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
                placeholder="500 000"
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
                placeholder="..."
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
                style={{ background: "var(--accent)", color: "#fff" }}
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
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
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
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                {editLoading ? t("form.submitting", lang) : t("common.save", lang)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {/* Given (lent out) */}
        <div
          className="rounded-[16px] p-4"
          style={{ background: "var(--income-wash)", border: "1px solid var(--border)" }}
        >
          <p className="text-xs font-medium mb-1" style={{ color: "var(--income)" }}>
            {t("debt.given", lang)}
          </p>
          <p className="text-xl font-bold tabular-nums" style={{ color: "var(--income)" }}>
            {formatMoney(totals.givenOpen)}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--fg-subtle)" }}>
            {t("common.currency", lang)}
          </p>
        </div>
        {/* Taken (borrowed) */}
        <div
          className="rounded-[16px] p-4"
          style={{ background: "var(--expense-wash)", border: "1px solid var(--border)" }}
        >
          <p className="text-xs font-medium mb-1" style={{ color: "var(--expense)" }}>
            {t("debt.taken", lang)}
          </p>
          <p className="text-xl font-bold tabular-nums" style={{ color: "var(--expense)" }}>
            {formatMoney(totals.takenOpen)}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--fg-subtle)" }}>
            {t("common.currency", lang)}
          </p>
        </div>
      </div>

      {/* Header row: tabs + add button */}
      <div className="flex items-center justify-between gap-3 mb-4">
        {/* Segmented tabs */}
        <div
          className="flex rounded-[12px] p-1 gap-1"
          style={{ background: "var(--surface-sunken)", display: "inline-flex" }}
        >
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="px-4 py-1.5 rounded-[10px] text-sm font-semibold transition-all min-h-[36px]"
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

        {/* Add button */}
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-[12px] text-sm font-semibold min-h-[44px]"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          <span className="text-lg leading-none">+</span>
          <span className="hidden sm:inline">{t("debt.add", lang)}</span>
        </button>
      </div>

      {/* Debt list */}
      <div
        className="rounded-[12px] overflow-hidden"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
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
              return (
                <div
                  key={debt.id}
                  className="px-5 py-4 transition-colors"
                  style={{
                    borderTop: idx === 0 ? undefined : "1px solid var(--border)",
                    opacity: isSettled ? 0.6 : 1,
                  }}
                >
                  <div className="flex items-center gap-3">
                    {/* Direction icon */}
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold"
                      style={{
                        background: isGiven ? "var(--income-wash)" : "var(--expense-wash)",
                        color: isGiven ? "var(--income)" : "var(--expense)",
                      }}
                    >
                      {isGiven ? "↑" : "↓"}
                    </div>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
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
                        {formatDate(debt.occurredAt)}
                        {debt.note ? ` · ${debt.note}` : ""}
                      </p>
                    </div>

                    {/* Amount (tabular) */}
                    <div className="text-right shrink-0">
                      <p
                        className="font-bold text-sm tabular-nums"
                        style={{ color: isGiven ? "var(--income)" : "var(--expense)" }}
                      >
                        {isGiven ? "+" : "−"}{formatMoney(debt.amountUzs)}
                      </p>
                      <p className="text-xs" style={{ color: "var(--fg-subtle)" }}>
                        {t("common.currency", lang)}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0 ml-1">
                      {/* Settle */}
                      {!isSettled && (
                        <button
                          onClick={() => handleSettle(debt.id)}
                          disabled={settlingId === debt.id}
                          className="p-2 rounded-[10px] transition-all min-h-[40px] min-w-[40px] flex items-center justify-center disabled:opacity-40"
                          style={{ color: "var(--income)" }}
                          title={t("debt.settle", lang)}
                        >
                          {settlingId === debt.id ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10" strokeOpacity="0.3" />
                            </svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>
                      )}

                      {/* Edit */}
                      {!isSettled && (
                        <button
                          onClick={() => openEdit(debt)}
                          className="p-2 rounded-[10px] transition-all min-h-[40px] min-w-[40px] flex items-center justify-center"
                          style={{ color: "var(--accent)" }}
                          title={t("common.edit", lang)}
                        >
                          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                          </svg>
                        </button>
                      )}

                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(debt.id)}
                        disabled={deletingId === debt.id}
                        className="p-2 rounded-[10px] transition-all min-h-[40px] min-w-[40px] flex items-center justify-center disabled:opacity-40"
                        style={{ color: "var(--expense)" }}
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
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
