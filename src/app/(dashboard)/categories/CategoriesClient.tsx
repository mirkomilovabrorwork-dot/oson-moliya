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

  // Segmented toggle: which type is shown
  const [activeTab, setActiveTab] = useState<"expense" | "income">("expense");

  // Add form state
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

  // Add category — type comes from activeTab
  const handleAdd = useCallback(async () => {
    if (!addName.trim()) return;
    setAddLoading(true);
    setAddError(null);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: addName.trim(), type: activeTab, emoji: addEmoji.trim() || null }),
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
  }, [addName, activeTab, addEmoji, lang, router]);

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
      if (!confirm(t("categories.delete.confirm", lang))) return;
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

  const visibleCats = cats.filter((c) => c.type === activeTab);

  const inputStyle = {
    border: "1px solid var(--color-border)",
    background: "var(--color-surface)",
    color: "var(--color-text-primary)",
  };
  const inputCls =
    "w-full rounded-[12px] px-3 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 min-h-[44px]";

  return (
    <>
      {toast && <Toast message={toast.msg} type={toast.type} onDone={() => setToast(null)} />}

      {/* Add category modal */}
      {showAddForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(15,23,42,0.5)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAddForm(false);
          }}
        >
          <div
            className="w-full max-w-sm rounded-[12px] p-6 space-y-4"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base" style={{ color: "var(--color-text-primary)" }}>
                {activeTab === "income"
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
                className="text-sm px-3 py-2 rounded-[12px]"
                style={{ background: "var(--color-expense-bg)", color: "var(--color-expense)" }}
              >
                {addError}
              </div>
            )}

            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: "var(--color-text-secondary)" }}
              >
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
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {t("categories.emoji", lang)}
              </label>
              <input
                type="text"
                value={addEmoji}
                onChange={(e) => setAddEmoji(e.target.value)}
                className="w-20 rounded-[12px] px-3 py-2.5 text-center text-lg"
                style={inputStyle}
                placeholder="📦"
                maxLength={2}
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowAddForm(false)}
                className="flex-1 py-2.5 rounded-[12px] text-sm font-semibold"
                style={{ border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}
              >
                {t("common.cancel", lang)}
              </button>
              <button
                onClick={handleAdd}
                disabled={addLoading || !addName.trim()}
                className="flex-1 py-2.5 rounded-[12px] text-sm font-semibold disabled:opacity-60"
                style={{ background: "var(--color-brand)", color: "#fff" }}
              >
                {addLoading ? t("form.submitting", lang) : t("common.save", lang)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Segmented toggle: Xarajat / Daromad */}
      <div
        className="flex rounded-[12px] p-1 gap-1"
        style={{ background: "var(--color-surface-2)", display: "inline-flex" }}
      >
        {(["expense", "income"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-5 py-2 rounded-[10px] text-sm font-semibold transition-all min-h-[36px]"
            style={
              activeTab === tab
                ? {
                    background: "var(--color-surface)",
                    color:
                      tab === "expense"
                        ? "var(--color-expense)"
                        : "var(--color-income)",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                  }
                : { color: "var(--color-text-muted)" }
            }
          >
            {tab === "expense"
              ? t("categories.expense_tab", lang)
              : t("categories.income_tab", lang)}
          </button>
        ))}
      </div>

      {/* Category list */}
      <div
        className="rounded-[12px] overflow-hidden"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        {/* Add-row at top */}
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full flex items-center gap-4 px-5 py-4 border-b transition-colors"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-brand)",
          }}
        >
          <span
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-lg font-bold"
            style={{ background: "var(--color-brand-light)", color: "var(--color-brand)" }}
          >
            +
          </span>
          <span className="text-sm font-medium">{t("categories.add", lang)}</span>
        </button>

        {visibleCats.length === 0 ? (
          <div className="px-5 py-12 text-center space-y-2">
            <div className="text-4xl mb-3">📂</div>
            <p className="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>
              {t("categories.empty", lang)}
            </p>
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              {t("categories.empty_hint", lang)}
            </p>
          </div>
        ) : (
          <div>
            {visibleCats.map((cat, idx) => (
              <div
                key={cat.id}
                className="row-hover px-5 py-4 transition-colors"
                style={{
                  borderTop: idx === 0 ? undefined : `1px solid var(--color-border)`,
                }}
              >
                <div className="flex items-center gap-4">
                  {/* Icon tile */}
                  <span
                    className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-xl"
                    style={{
                      background:
                        cat.type === "income"
                          ? "var(--color-income-bg)"
                          : "var(--color-expense-bg)",
                    }}
                  >
                    {cat.emoji ?? (cat.type === "income" ? "↗" : "↘")}
                  </span>

                  {/* Name + meta */}
                  <div className="flex-1 min-w-0">
                    {renamingId === cat.id ? (
                      <div className="flex gap-2 flex-wrap">
                        <input
                          autoFocus
                          type="text"
                          value={renameVal}
                          onChange={(e) => setRenameVal(e.target.value)}
                          className="rounded-[10px] px-3 py-2 text-sm flex-1 min-w-[120px]"
                          style={inputStyle}
                          placeholder={t("categories.name", lang)}
                        />
                        <input
                          type="text"
                          value={renameEmoji}
                          onChange={(e) => setRenameEmoji(e.target.value)}
                          className="rounded-[10px] px-3 py-2 text-sm w-16"
                          style={inputStyle}
                          placeholder="😀"
                          maxLength={2}
                        />
                        <button
                          onClick={() => handleRename(cat.id)}
                          disabled={renameLoading}
                          className="px-3 py-2 rounded-[10px] text-xs font-semibold disabled:opacity-60"
                          style={{ background: "var(--color-brand)", color: "#fff" }}
                        >
                          {t("common.save", lang)}
                        </button>
                        <button
                          onClick={() => setRenamingId(null)}
                          className="px-3 py-2 rounded-[10px] text-xs font-medium"
                          style={{
                            border: "1px solid var(--color-border)",
                            color: "var(--color-text-secondary)",
                          }}
                        >
                          {t("common.cancel", lang)}
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p
                            className="font-medium text-sm"
                            style={{ color: "var(--color-text-primary)" }}
                          >
                            {cat.name}
                          </p>
                          {cat.isDefault && (
                            <span
                              className="text-xs px-2 py-0.5 rounded-full font-medium"
                              style={{
                                background: "var(--color-surface-2)",
                                color: "var(--color-text-muted)",
                              }}
                            >
                              {t("categories.default_badge", lang)}
                            </span>
                          )}
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                          {cat.txCount} {t("categories.tx_count", lang)}
                          {cat.type === "expense" && cat.budgetLimit
                            ? ` · ${formatMoney(cat.budgetLimit)} so'm ${t("categories.budget_progress", lang)}`
                            : ""}
                        </p>
                      </>
                    )}
                  </div>

                  {/* Action buttons (right side) */}
                  {renamingId !== cat.id && (
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Budget chip for expense */}
                      {cat.type === "expense" && editBudgetId !== cat.id && (
                        <button
                          onClick={() => {
                            setEditBudgetId(cat.id);
                            setBudgetVal(cat.budgetLimit ? formatMoney(cat.budgetLimit) : "");
                          }}
                          className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all"
                          style={{
                            background: cat.budgetLimit
                              ? "var(--color-expense-bg)"
                              : "var(--color-surface-2)",
                            color: cat.budgetLimit
                              ? "var(--color-expense)"
                              : "var(--color-text-muted)",
                          }}
                        >
                          <svg
                            width="11"
                            height="11"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fillRule="evenodd"
                              d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z"
                              clipRule="evenodd"
                            />
                          </svg>
                          {cat.budgetLimit
                            ? `${formatMoney(cat.budgetLimit)}`
                            : t("budget.set_limit", lang)}
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setRenamingId(cat.id);
                          setRenameVal(cat.name);
                          setRenameEmoji(cat.emoji ?? "");
                        }}
                        className="p-2 rounded-[10px] transition-all min-h-[40px] min-w-[40px] flex items-center justify-center"
                        style={{ color: "var(--color-brand)" }}
                        title={t("categories.rename", lang)}
                      >
                        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(cat.id)}
                        className="p-2 rounded-[10px] transition-all min-h-[40px] min-w-[40px] flex items-center justify-center"
                        style={{ color: "var(--color-expense)" }}
                        title={t("categories.delete", lang)}
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
                  )}
                </div>

                {/* Budget inline edit (below the row) */}
                {cat.type === "expense" && editBudgetId === cat.id && (
                  <div className="flex gap-2 flex-wrap items-center mt-3 ml-15 pl-1">
                    <input
                      autoFocus
                      type="text"
                      inputMode="numeric"
                      value={budgetVal}
                      onChange={(e) => setBudgetVal(e.target.value)}
                      placeholder="1 000 000"
                      className="rounded-[10px] px-3 py-2 text-sm tabular w-40"
                      style={inputStyle}
                    />
                    <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                      so&apos;m
                    </span>
                    <button
                      onClick={() => handleBudgetSave(cat.id)}
                      disabled={budgetLoading}
                      className="px-3 py-2 rounded-[10px] text-xs font-semibold disabled:opacity-60"
                      style={{ background: "var(--color-brand)", color: "#fff" }}
                    >
                      {t("common.save", lang)}
                    </button>
                    <button
                      onClick={() => setEditBudgetId(null)}
                      className="px-3 py-2 rounded-[10px] text-xs"
                      style={{
                        border: "1px solid var(--color-border)",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      {t("common.cancel", lang)}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
