"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { LangCode } from "@/lib/i18n/translate";
import { t } from "@/lib/i18n/translate";
import { Toast } from "@/components/Toast";

interface CategoryRow {
  id: string;
  name: string;
  type: "income" | "expense";
  emoji: string | null;
  isDefault: boolean;
  txCount: number;
  budgetLimit: string | null; // only for expense
}

interface Props {
  categories: CategoryRow[];
  lang: LangCode;
}

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

export function CategoriesClient({ categories: initial, lang }: Props) {
  const router = useRouter();
  const [cats, setCats] = useState<CategoryRow[]>(initial);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  // Add form state
  const [addType, setAddType] = useState<"income" | "expense">("expense");
  const [addName, setAddName] = useState("");
  const [addEmoji, setAddEmoji] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [renameEmoji, setRenameEmoji] = useState("");
  const [renameLoading, setRenameLoading] = useState(false);

  // Budget edit state
  const [editBudgetId, setEditBudgetId] = useState<string | null>(null);
  const [budgetVal, setBudgetVal] = useState("");
  const [budgetLoading, setBudgetLoading] = useState(false);

  const showToast = (msg: string, type: "success" | "error" = "success") =>
    setToast({ msg, type });

  // Add category
  const handleAdd = useCallback(async () => {
    if (!addName.trim()) return;
    setAddLoading(true);
    setAddError(null);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: addName.trim(), type: addType, emoji: addEmoji.trim() || null }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json() as CategoryRow;
      setCats((prev) => [...prev, { ...created, txCount: 0, budgetLimit: null }]);
      setAddName("");
      setAddEmoji("");
      setShowAddForm(false);
      showToast(t("categories.saved", lang));
      router.refresh();
    } catch {
      setAddError(t("error.generic", lang));
    } finally {
      setAddLoading(false);
    }
  }, [addName, addType, addEmoji, lang, router]);

  // Rename (optimistic)
  const handleRename = useCallback(
    async (id: string) => {
      if (!renameVal.trim()) return;
      setRenameLoading(true);
      try {
        const res = await fetch(`/api/categories/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: renameVal.trim(), emoji: renameEmoji.trim() || null }),
        });
        if (!res.ok) throw new Error();
        setCats((prev) =>
          prev.map((c) =>
            c.id === id
              ? { ...c, name: renameVal.trim(), emoji: renameEmoji.trim() || null }
              : c
          )
        );
        setRenamingId(null);
        showToast(t("categories.saved", lang));
        router.refresh();
      } catch {
        showToast(t("error.generic", lang), "error");
      } finally {
        setRenameLoading(false);
      }
    },
    [renameVal, renameEmoji, lang, router]
  );

  // Delete
  const handleDelete = useCallback(
    async (id: string) => {
      const cat = cats.find((c) => c.id === id);
      if (!cat) return;
      const msg = t("categories.delete.confirm", lang);
      if (!confirm(msg)) return;
      try {
        const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error();
        setCats((prev) => prev.filter((c) => c.id !== id));
        showToast(t("categories.deleted", lang));
        router.refresh();
      } catch {
        showToast(t("error.generic", lang), "error");
      }
    },
    [cats, lang, router]
  );

  // Upsert budget
  const handleBudgetSave = useCallback(
    async (catId: string) => {
      setBudgetLoading(true);
      try {
        const limit = budgetVal.replace(/[\s ]/g, "");
        const res = await fetch(`/api/budgets`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ categoryId: catId, limitUzs: limit }),
        });
        if (!res.ok) throw new Error();
        setCats((prev) =>
          prev.map((c) => (c.id === catId ? { ...c, budgetLimit: limit || null } : c))
        );
        setEditBudgetId(null);
        showToast(t("categories.budget_saved", lang));
        router.refresh();
      } catch {
        showToast(t("error.generic", lang), "error");
      } finally {
        setBudgetLoading(false);
      }
    },
    [budgetVal, lang, router]
  );

  const income = cats.filter((c) => c.type === "income");
  const expense = cats.filter((c) => c.type === "expense");

  const inputStyle = {
    border: "1px solid var(--color-border)",
    background: "var(--color-surface)",
    color: "var(--color-text-primary)",
  };
  const inputCls = "w-full rounded-lg px-3 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 min-h-[44px]";

  const renderCatList = (list: CategoryRow[], typeLabel: string) => (
    <div
      className="rounded-xl shadow-sm overflow-hidden"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <div
        className="px-5 py-4 border-b flex items-center justify-between"
        style={{ borderColor: "var(--color-border)" }}
      >
        <h2 className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>
          {typeLabel}
        </h2>
        <button
          onClick={() => {
            setAddType(list[0]?.type ?? "expense");
            setShowAddForm(true);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
          style={{ background: "var(--color-brand-light)", color: "var(--color-brand)" }}
        >
          <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
          </svg>
          {t("categories.add", lang)}
        </button>
      </div>

      {list.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <div className="text-3xl mb-2">📂</div>
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            {t("categories.empty", lang)}
          </p>
        </div>
      ) : (
        <div className="divide-y" style={{ "--divide-color": "var(--color-border)" } as React.CSSProperties}>
          {list.map((cat) => (
            <div key={cat.id} className="px-5 py-4 space-y-3">
              {/* Cat header */}
              <div className="flex items-start gap-3">
                <span className="text-2xl mt-0.5 shrink-0">{cat.emoji ?? "📁"}</span>
                <div className="flex-1 min-w-0">
                  {renamingId === cat.id ? (
                    <div className="flex gap-2 flex-wrap">
                      <input
                        autoFocus
                        type="text"
                        value={renameVal}
                        onChange={(e) => setRenameVal(e.target.value)}
                        className="rounded-lg px-3 py-2 text-sm flex-1 min-w-[120px]"
                        style={inputStyle}
                        placeholder={t("categories.name", lang)}
                      />
                      <input
                        type="text"
                        value={renameEmoji}
                        onChange={(e) => setRenameEmoji(e.target.value)}
                        className="rounded-lg px-3 py-2 text-sm w-16"
                        style={inputStyle}
                        placeholder="😀"
                        maxLength={2}
                      />
                      <button
                        onClick={() => handleRename(cat.id)}
                        disabled={renameLoading}
                        className="px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-60"
                        style={{ background: "var(--color-brand)", color: "#fff" }}
                      >
                        {t("common.save", lang)}
                      </button>
                      <button
                        onClick={() => setRenamingId(null)}
                        className="px-3 py-2 rounded-lg text-xs font-medium"
                        style={{ border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}
                      >
                        {t("common.cancel", lang)}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm" style={{ color: "var(--color-text-primary)" }}>
                        {cat.name}
                      </p>
                      {cat.isDefault && (
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: "#F1F5F9", color: "var(--color-text-muted)" }}
                        >
                          {t("categories.default_badge", lang)}
                        </span>
                      )}
                      <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {cat.txCount} {t("categories.tx_count", lang)}
                      </span>
                    </div>
                  )}
                </div>
                {/* Actions */}
                {renamingId !== cat.id && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => {
                        setRenamingId(cat.id);
                        setRenameVal(cat.name);
                        setRenameEmoji(cat.emoji ?? "");
                      }}
                      className="p-2 rounded-lg transition-all min-h-[40px] min-w-[40px] flex items-center justify-center"
                      style={{ color: "var(--color-brand)" }}
                      title={t("categories.rename", lang)}
                    >
                      <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(cat.id)}
                      className="p-2 rounded-lg transition-all min-h-[40px] min-w-[40px] flex items-center justify-center"
                      style={{ color: "var(--color-expense)" }}
                      title={t("categories.delete", lang)}
                    >
                      <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/>
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              {/* Budget (expense only) */}
              {cat.type === "expense" && (
                <div className="ml-10">
                  {editBudgetId === cat.id ? (
                    <div className="flex gap-2 flex-wrap items-center">
                      <input
                        autoFocus
                        type="text"
                        inputMode="numeric"
                        value={budgetVal}
                        onChange={(e) => setBudgetVal(e.target.value)}
                        placeholder="1 000 000"
                        className="rounded-lg px-3 py-2 text-sm tabular w-40"
                        style={inputStyle}
                      />
                      <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>so'm</span>
                      <button
                        onClick={() => handleBudgetSave(cat.id)}
                        disabled={budgetLoading}
                        className="px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-60"
                        style={{ background: "var(--color-brand)", color: "#fff" }}
                      >
                        {t("common.save", lang)}
                      </button>
                      <button
                        onClick={() => setEditBudgetId(null)}
                        className="px-3 py-2 rounded-lg text-xs"
                        style={{ border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}
                      >
                        {t("common.cancel", lang)}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditBudgetId(cat.id);
                        setBudgetVal(cat.budgetLimit ? formatMoney(cat.budgetLimit) : "");
                      }}
                      className="flex items-center gap-2 text-xs transition-all rounded-lg px-2 py-1"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/>
                      </svg>
                      {cat.budgetLimit
                        ? `${formatMoney(cat.budgetLimit)} so'm ${t("categories.budget_progress", lang)}`
                        : t("budget.set_limit", lang)}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      {toast && <Toast message={toast.msg} type={toast.type} onDone={() => setToast(null)} />}

      {/* Add category modal */}
      {showAddForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(15,23,42,0.5)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddForm(false); }}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6 space-y-4 shadow-2xl"
            style={{ background: "var(--color-surface)" }}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base" style={{ color: "var(--color-text-primary)" }}>
                {addType === "income"
                  ? t("categories.add.income", lang)
                  : t("categories.add.expense", lang)}
              </h3>
              <button
                onClick={() => setShowAddForm(false)}
                className="p-1.5 rounded-lg"
                style={{ color: "var(--color-text-muted)" }}
              >
                ✕
              </button>
            </div>

            {addError && (
              <div
                className="text-sm px-3 py-2 rounded-lg"
                style={{ background: "var(--color-expense-bg)", color: "var(--color-expense)" }}
              >
                {addError}
              </div>
            )}

            {/* Type */}
            <div className="flex gap-2">
              {(["income", "expense"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setAddType(opt)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all"
                  style={
                    addType === opt
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

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-secondary)" }}>
                {t("categories.name", lang)}
              </label>
              <input
                autoFocus
                type="text"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                className={inputCls}
                style={inputStyle}
                placeholder="Oylik, Logistika..."
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-secondary)" }}>
                {t("categories.emoji", lang)}
              </label>
              <input
                type="text"
                value={addEmoji}
                onChange={(e) => setAddEmoji(e.target.value)}
                className="w-20 rounded-lg px-3 py-2.5 text-center text-lg"
                style={inputStyle}
                placeholder="📦"
                maxLength={2}
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowAddForm(false)}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold"
                style={{ border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}
              >
                {t("common.cancel", lang)}
              </button>
              <button
                onClick={handleAdd}
                disabled={addLoading || !addName.trim()}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60"
                style={{ background: "var(--color-brand)", color: "#fff" }}
              >
                {addLoading ? t("form.submitting", lang) : t("common.save", lang)}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {renderCatList(income, t("categories.income", lang))}
        {renderCatList(expense, t("categories.expense", lang))}
      </div>
    </>
  );
}
