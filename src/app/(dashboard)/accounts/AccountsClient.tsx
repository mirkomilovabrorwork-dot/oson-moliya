"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { LangCode } from "@/lib/i18n/translate";
import { t } from "@/lib/i18n/translate";
import { Toast } from "@/components/Toast";
import { TypedDeleteDialog } from "@/components/TypedDeleteDialog";
import type { DisplayCurrency, Rates } from "@/lib/rates";
import { formatMoney as formatMoneyFn } from "@/lib/currency";

// Local types — all BigInt fields are serialized to string
interface AccountRow {
  id: string;
  name: string;
  type: "cash" | "card" | "other";
  initialBalanceUzs: string;
  balance: string;
  createdAt: string;
}

interface Props {
  accounts: AccountRow[];
  totalBalance: string;
  lang: LangCode;
  currency: DisplayCurrency;
  rates: Rates;
}

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
  return (n < 0 ? "-" : "") + parts.join(" ");
}

const TYPE_ICONS: Record<string, string> = {
  cash: "💵",
  card: "💳",
  other: "🏦",
};

const inputStyle = {
  border: "1px solid var(--border-strong)",
  background: "transparent",
  color: "var(--fg)",
};
const inputCls =
  "w-full rounded-[12px] px-3 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 min-h-[44px]";

export function AccountsClient({ accounts: initial, totalBalance: initialTotal, lang, currency, rates }: Props) {
  const router = useRouter();
  const fmtBig = (s: string) =>
    formatMoneyFn(BigInt(Math.round(Math.abs(Number(s)))), currency, rates, lang);
  const [accounts, setAccounts] = useState<AccountRow[]>(initial);
  const [totalBalance, setTotalBalance] = useState(initialTotal);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") =>
    setToast({ msg, type });

  // ── Add form ──────────────────────────────────────────────────────────────
  const [showAdd, setShowAdd] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addName, setAddName] = useState("");
  const [addType, setAddType] = useState<"cash" | "card" | "other">("cash");
  const [addInitial, setAddInitial] = useState("");

  const resetAdd = () => {
    setAddName("");
    setAddType("cash");
    setAddInitial("");
    setAddError(null);
  };

  const handleAdd = async () => {
    if (!addName.trim()) {
      setAddError(t("account.name", lang) + " — " + t("error.generic", lang));
      return;
    }
    setAddLoading(true);
    setAddError(null);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addName.trim(),
          type: addType,
          initialBalanceUzs: addInitial.replace(/\s/g, "") || "0",
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error || t("error.generic", lang));
      }
      const created = (await res.json()) as AccountRow;
      setAccounts((prev) => [...prev, created]);
      // Recalculate total
      setTotalBalance((prev) => String(Number(prev) + Number(created.balance)));
      resetAdd();
      setShowAdd(false);
      showToast(t("account.saved", lang));
      router.refresh();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : t("error.generic", lang));
    } finally {
      setAddLoading(false);
    }
  };

  // ── Edit form ─────────────────────────────────────────────────────────────
  const [editTarget, setEditTarget] = useState<AccountRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<"cash" | "card" | "other">("cash");
  const [editInitial, setEditInitial] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const openEdit = (acc: AccountRow) => {
    setEditTarget(acc);
    setEditName(acc.name);
    setEditType(acc.type);
    setEditInitial(acc.initialBalanceUzs);
    setEditError(null);
  };

  const handleEditSave = async () => {
    if (!editTarget) return;
    if (!editName.trim()) {
      setEditError(t("account.name", lang) + " — " + t("error.generic", lang));
      return;
    }
    setEditLoading(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/accounts/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          type: editType,
          initialBalanceUzs: editInitial.replace(/\s/g, "") || "0",
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error || t("error.generic", lang));
      }
      const updated = (await res.json()) as AccountRow;
      setAccounts((prev) =>
        prev.map((a) => (a.id === updated.id ? updated : a))
      );
      // Recalculate total: remove old balance, add new balance
      setTotalBalance((prev) => {
        const delta = Number(updated.balance) - Number(editTarget.balance);
        return String(Number(prev) + delta);
      });
      setEditTarget(null);
      showToast(t("account.saved", lang));
      router.refresh();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : t("error.generic", lang));
    } finally {
      setEditLoading(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<AccountRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    try {
      const res = await fetch(`/api/accounts/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      setTotalBalance((prev) => String(Number(prev) - Number(deleteTarget.balance)));
      setAccounts((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      setDeleteTarget(null);
      showToast(t("account.deleted", lang));
      router.refresh();
    } catch {
      showToast(t("error.generic", lang), "error");
    } finally {
      setDeletingId(null);
    }
  }, [deleteTarget, lang, router]);

  const totalN = Number(totalBalance);

  return (
    <>
      {toast && (
        <Toast message={toast.msg} type={toast.type} onDone={() => setToast(null)} />
      )}

      <TypedDeleteDialog
        open={Boolean(deleteTarget)}
        title={t("delete.typed.title", lang)}
        warning={t("delete.typed.warning", lang)}
        description={t("account.delete.confirm", lang)}
        targetLabel={deleteTarget?.name}
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

      {/* ── Total balance header ── */}
      <div
        className="rounded-[14px] p-5 mb-6"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      >
        <p
          className="text-xs font-medium uppercase tracking-wide mb-1"
          style={{ color: "var(--fg-subtle)" }}
        >
          {t("account.total_balance", lang)}
        </p>
        <p
          className="text-3xl font-bold tabular"
          style={{ color: totalN >= 0 ? "var(--income)" : "var(--expense)" }}
        >
          {totalN >= 0 ? "+" : "−"}
          {fmtBig(totalBalance)}
        </p>
      </div>

      {/* ── Account list ── */}
      {accounts.length === 0 ? (
        <div
          className="rounded-[14px] py-16 flex flex-col items-center gap-3"
          style={{
            background: "var(--surface)",
            border: "1px dashed var(--border-strong)",
          }}
        >
          <span style={{ fontSize: 36 }}>🏦</span>
          <p className="font-medium text-center" style={{ color: "var(--fg-muted)" }}>
            {t("account.empty", lang)}
          </p>
          <p className="text-sm text-center" style={{ color: "var(--fg-subtle)" }}>
            {t("account.empty.hint", lang)}
          </p>
        </div>
      ) : (
        <div className="space-y-3 mb-6">
          {accounts.map((acc) => {
            const bal = Number(acc.balance);
            return (
              <div
                key={acc.id}
                className="rounded-[14px] px-4 py-4 flex items-center gap-3"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                }}
              >
                {/* Icon */}
                <span
                  className="w-11 h-11 rounded-[12px] flex items-center justify-center shrink-0 text-xl"
                  style={{ background: "var(--surface-sunken)" }}
                  aria-hidden="true"
                >
                  {TYPE_ICONS[acc.type] ?? "🏦"}
                </span>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p
                    className="text-sm font-semibold truncate"
                    style={{ color: "var(--fg)" }}
                  >
                    {acc.name}
                  </p>
                  <p className="text-xs" style={{ color: "var(--fg-subtle)" }}>
                    {t(`account.type.${acc.type}`, lang)}
                  </p>
                </div>

                {/* Balance */}
                <div className="text-right shrink-0">
                  <p
                    className="text-sm font-bold tabular"
                    style={{ color: bal >= 0 ? "var(--income)" : "var(--expense)" }}
                  >
                    {bal >= 0 ? "+" : "−"}
                    {fmtBig(acc.balance)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => openEdit(acc)}
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
                    onClick={() => setDeleteTarget(acc)}
                    disabled={deletingId === acc.id}
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
            );
          })}
        </div>
      )}

      {/* ── Add account button ── */}
      <button
        onClick={() => {
          resetAdd();
          setShowAdd(true);
        }}
        className="w-full py-3 rounded-[14px] text-sm font-semibold transition-all min-h-[44px]"
        style={{
          border: "2px dashed var(--border-strong)",
          color: "var(--accent)",
          background: "transparent",
        }}
      >
        + {t("account.add", lang)}
      </button>

      {/* ── Add modal ── */}
      {showAdd && (
        <AccountModal
          title={t("account.add", lang)}
          name={addName}
          setName={setAddName}
          type={addType}
          setType={setAddType}
          initial={addInitial}
          setInitial={setAddInitial}
          loading={addLoading}
          error={addError}
          lang={lang}
          onSave={handleAdd}
          onClose={() => {
            setShowAdd(false);
            resetAdd();
          }}
        />
      )}

      {/* ── Edit modal ── */}
      {editTarget && (
        <AccountModal
          title={t("account.edit.title", lang)}
          name={editName}
          setName={setEditName}
          type={editType}
          setType={setEditType}
          initial={editInitial}
          setInitial={setEditInitial}
          loading={editLoading}
          error={editError}
          lang={lang}
          onSave={handleEditSave}
          onClose={() => setEditTarget(null)}
        />
      )}
    </>
  );
}

// ── Shared modal ──────────────────────────────────────────────────────────────

interface ModalProps {
  title: string;
  name: string;
  setName: (v: string) => void;
  type: "cash" | "card" | "other";
  setType: (v: "cash" | "card" | "other") => void;
  initial: string;
  setInitial: (v: string) => void;
  loading: boolean;
  error: string | null;
  lang: LangCode;
  onSave: () => void;
  onClose: () => void;
}

function AccountModal({
  title,
  name,
  setName,
  type,
  setType,
  initial,
  setInitial,
  loading,
  error,
  lang,
  onSave,
  onClose,
}: ModalProps) {
  const inputStyle = {
    border: "1px solid var(--border-strong)",
    background: "transparent",
    color: "var(--fg)",
  };
  const inputCls =
    "w-full rounded-[12px] px-3 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 min-h-[44px]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.5)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-[14px] p-6 space-y-4"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base" style={{ color: "var(--fg)" }}>
            {title}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-all"
            style={{ color: "var(--fg-subtle)" }}
          >
            ✕
          </button>
        </div>

        {error && (
          <div
            className="text-sm px-3 py-2 rounded-[12px]"
            style={{ background: "var(--expense-wash)", color: "var(--expense)" }}
          >
            {error}
          </div>
        )}

        {/* Name */}
        <div>
          <label
            className="block text-xs font-medium mb-1.5"
            style={{ color: "var(--fg-muted)" }}
          >
            {t("account.name", lang)}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
            style={inputStyle}
            maxLength={100}
          />
        </div>

        {/* Type — segmented */}
        <div>
          <label
            className="block text-xs font-medium mb-1.5"
            style={{ color: "var(--fg-muted)" }}
          >
            {t("account.type", lang)}
          </label>
          <div
            className="flex rounded-md p-0.5 gap-0.5"
            style={{ background: "var(--surface-sunken)" }}
          >
            {(["cash", "card", "other"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setType(opt)}
                className="flex-1 py-2 rounded-[8px] text-sm font-medium transition-all min-h-[36px] flex items-center justify-center gap-1"
                style={
                  type === opt
                    ? {
                        background: "var(--surface)",
                        color: "var(--accent)",
                        boxShadow: "var(--shadow-sm)",
                      }
                    : { color: "var(--fg-subtle)" }
                }
              >
                <span aria-hidden="true">{TYPE_ICONS[opt]}</span>
                <span className="hidden sm:inline">{t(`account.type.${opt}`, lang)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Initial balance */}
        <div>
          <label
            className="block text-xs font-medium mb-1.5"
            style={{ color: "var(--fg-muted)" }}
          >
            {t("account.initial_balance", lang)}
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={initial}
            onChange={(e) => setInitial(e.target.value)}
            placeholder="0"
            className={`${inputCls} tabular`}
            style={inputStyle}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-[12px] text-sm font-semibold transition-all min-h-[44px]"
            style={{ border: "1px solid var(--border)", color: "var(--fg-muted)" }}
          >
            {t("common.cancel", lang)}
          </button>
          <button
            onClick={onSave}
            disabled={loading}
            className="flex-1 py-2.5 rounded-[12px] text-sm font-semibold transition-all min-h-[44px] disabled:opacity-60"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {loading ? t("form.submitting", lang) : t("common.save", lang)}
          </button>
        </div>
      </div>
    </div>
  );
}
