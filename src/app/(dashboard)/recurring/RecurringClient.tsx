"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { LangCode } from "@/lib/i18n/translate";
import { t } from "@/lib/i18n/translate";
import { Toast } from "@/components/Toast";
import { formatMoney } from "@/lib/currency";
import type { Rates } from "@/lib/rates";

type TxType = "income" | "expense";
type Frequency = "monthly" | "yearly";

interface CategoryOption {
  id: string;
  name: string;
  emoji: string | null;
  type: TxType;
}

interface RuleRow {
  id: string;
  type: TxType;
  categoryId: string | null;
  category: { id: string; name: string; emoji: string | null; type: TxType } | null;
  amountUzs: string;
  originalCurrency: string | null;
  originalAmount: string | null;
  note: string | null;
  frequency: Frequency;
  dayOfMonth: number;
  monthOfYear: number | null;
  startDate: string;
  endDate: string | null;
  pausedAt: string | null;
  lastGeneratedAt: string | null;
  createdAt: string;
}

interface Props {
  rules: RuleRow[];
  categories: CategoryOption[];
  lang: LangCode;
}

// Fix C: use shared formatter (space-grouped) instead of local Intl.NumberFormat (comma-grouped).
// Recurring amounts are always UZS, so rates is unused in the UZS branch.
function formatAmount(amountUzs: string, lang: LangCode): string {
  try {
    return formatMoney(BigInt(amountUzs.replace(/\s/g, "")), "UZS", {} as Rates, lang);
  } catch {
    return amountUzs;
  }
}

function getScheduleLabel(rule: RuleRow, lang: LangCode): string {
  const MONTH_NAMES_UZ = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];
  const MONTH_NAMES_RU = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
  const MONTH_NAMES_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  if (rule.frequency === "monthly") {
    return t("recurring.every_month", lang).replace("{day}", String(rule.dayOfMonth));
  } else {
    const months = lang === "ru" ? MONTH_NAMES_RU : lang === "en" ? MONTH_NAMES_EN : MONTH_NAMES_UZ;
    const monthName = rule.monthOfYear ? months[rule.monthOfYear - 1] : "?";
    return t("recurring.every_year", lang)
      .replace("{day}", String(rule.dayOfMonth))
      .replace("{month}", monthName);
  }
}

const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const MONTH_NAMES_UZ = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];
const MONTH_NAMES_RU = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const MONTH_NAMES_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const inputStyle = { border: "1px solid var(--border)", background: "var(--surface-elevated)", color: "var(--fg)" };
const inputCls = "w-full rounded-[12px] px-3 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 min-h-[44px]";

export function RecurringClient({ rules: initial, categories, lang }: Props) {
  const router = useRouter();
  const [rules, setRules] = useState<RuleRow[]>(initial);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const showToast = (message: string, type: "success" | "error" = "success") => setToast({ message, type });

  // Add form state
  const [showAdd, setShowAdd] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addType, setAddType] = useState<TxType>("expense");
  const [addCategoryId, setAddCategoryId] = useState("");
  const [addAmount, setAddAmount] = useState("");
  const [addFrequency, setAddFrequency] = useState<Frequency>("monthly");
  const [addDay, setAddDay] = useState(1);
  const [addMonth, setAddMonth] = useState(1);
  const [addStartDate, setAddStartDate] = useState("");
  const [addEndDate, setAddEndDate] = useState("");
  const [addNote, setAddNote] = useState("");

  // Init startDate on mount to avoid SSR mismatch
  useEffect(() => {
    setAddStartDate(new Date().toISOString().slice(0, 10));
  }, []);

  const filteredCategories = categories.filter((c) => c.type === addType);
  const monthNames = lang === "ru" ? MONTH_NAMES_RU : lang === "en" ? MONTH_NAMES_EN : MONTH_NAMES_UZ;

  const handleAdd = useCallback(async () => {
    if (!addAmount.trim() || !addCategoryId) return;
    setAddLoading(true);
    setAddError(null);
    try {
      const body: Record<string, unknown> = {
        type: addType,
        categoryId: addCategoryId || null,
        amountUzs: addAmount.replace(/\s/g, ""),
        frequency: addFrequency,
        dayOfMonth: addDay,
        startDate: addStartDate ? new Date(addStartDate).toISOString() : new Date().toISOString(),
        note: addNote.trim() || null,
      };
      if (addFrequency === "yearly") body.monthOfYear = addMonth;
      if (addEndDate) body.endDate = new Date(addEndDate).toISOString();

      const res = await fetch("/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      const created = await res.json() as RuleRow;
      setRules((prev) => [...prev, created]);
      setShowAdd(false);
      setAddAmount("");
      setAddNote("");
      setAddCategoryId("");
      showToast(t("recurring.saved", lang));
      router.refresh();
    } catch {
      setAddError(t("error.generic", lang));
    } finally {
      setAddLoading(false);
    }
  }, [addType, addCategoryId, addAmount, addFrequency, addDay, addMonth, addStartDate, addEndDate, addNote, lang, router]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm(t("common.delete", lang) + "?")) return;
    try {
      const res = await fetch(`/api/recurring/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setRules((prev) => prev.filter((r) => r.id !== id));
      showToast(t("common.delete", lang));
      router.refresh();
    } catch {
      showToast(t("error.generic", lang), "error");
    }
  }, [lang, router]);

  const handlePause = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/recurring/${id}?action=pause`, { method: "PATCH" });
      if (!res.ok) throw new Error();
      const updated = await res.json() as RuleRow;
      setRules((prev) => prev.map((r) => r.id === id ? { ...r, pausedAt: updated.pausedAt } : r));
      showToast(t("recurring.action.pause", lang));
    } catch {
      showToast(t("error.generic", lang), "error");
    }
  }, [lang]);

  const handleResume = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/recurring/${id}?action=resume`, { method: "PATCH" });
      if (!res.ok) throw new Error();
      setRules((prev) => prev.map((r) => r.id === id ? { ...r, pausedAt: null } : r));
      showToast(t("recurring.action.resume", lang));
    } catch {
      showToast(t("error.generic", lang), "error");
    }
  }, [lang]);

  const getStatusBadge = (rule: RuleRow) => {
    if (!rule.categoryId) {
      return { label: t("recurring.status.needs_category", lang), color: "var(--expense)" };
    }
    if (rule.pausedAt) {
      return { label: t("recurring.status.paused", lang), color: "var(--fg-muted)" };
    }
    return { label: t("recurring.status.active", lang), color: "var(--income)" };
  };

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ color: "var(--fg)" }}>
          {t("recurring.title", lang)}
        </h1>
      </div>

      {/* Empty state */}
      {rules.length === 0 && !showAdd && (
        <div
          className="flex flex-col items-center justify-center py-16 text-center gap-3"
          style={{ background: "var(--surface-elevated)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)" }}
        >
          <div className="text-4xl">🔄</div>
          <div className="font-semibold text-lg" style={{ color: "var(--fg)" }}>
            {t("recurring.empty.title", lang)}
          </div>
          <div className="text-sm max-w-xs" style={{ color: "var(--fg-subtle)" }}>
            {t("recurring.empty.hint", lang)}
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="mt-2 px-5 py-2.5 text-sm font-semibold rounded-[12px] text-white"
            style={{ background: "var(--accent-gradient)" }}
          >
            {t("recurring.add", lang)}
          </button>
        </div>
      )}

      {/* Rules list */}
      {rules.length > 0 && (
        <div className="space-y-3 mb-6">
          {rules.map((rule) => {
            const badge = getStatusBadge(rule);
            return (
              <div
                key={rule.id}
                style={{
                  background: "var(--surface-elevated)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)",
                  padding: "16px",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="flex-shrink-0 w-9 h-9 rounded-[12px] flex items-center justify-center text-sm font-bold"
                    style={{
                      background: rule.type === "income" ? "var(--income-wash)" : "var(--expense-wash)",
                      color: rule.type === "income" ? "var(--income)" : "var(--expense)",
                    }}
                  >
                    {rule.type === "income" ? "+" : "-"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm" style={{ color: "var(--fg)" }}>
                        {rule.category ? `${rule.category.emoji ?? ""} ${rule.category.name}`.trim() : "—"}
                      </span>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: "var(--surface-sunken)", color: badge.color }}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <div className="text-base font-bold mt-0.5" style={{ color: "var(--fg)" }}>
                      {formatAmount(rule.amountUzs, lang)}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--fg-subtle)" }}>
                      {getScheduleLabel(rule, lang)}
                    </div>
                    {rule.note && (
                      <div className="text-xs mt-1 italic" style={{ color: "var(--fg-muted)" }}>
                        {rule.note}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    {rule.pausedAt ? (
                      <button
                        onClick={() => handleResume(rule.id)}
                        className="text-xs px-2 py-1 rounded-lg"
                        style={{ background: "var(--surface-sunken)", color: "var(--income)" }}
                      >
                        {t("recurring.action.resume", lang)}
                      </button>
                    ) : (
                      <button
                        onClick={() => handlePause(rule.id)}
                        className="text-xs px-2 py-1 rounded-lg"
                        style={{ background: "var(--surface-sunken)", color: "var(--fg-muted)" }}
                      >
                        {t("recurring.action.pause", lang)}
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(rule.id)}
                      className="text-xs px-2 py-1 rounded-lg"
                      style={{ background: "var(--expense-wash)", color: "var(--expense)" }}
                    >
                      {t("common.delete", lang)}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating add button (when list is non-empty) — Fix E: short label for 375px */}
      {rules.length > 0 && !showAdd && (
        <button
          onClick={() => setShowAdd(true)}
          className="fixed bottom-24 right-4 px-5 py-3 text-sm font-semibold rounded-[14px] shadow-lg text-white z-30"
          style={{ background: "var(--accent-gradient)" }}
        >
          {t("recurring.add_short", lang)}
        </button>
      )}

      {/* Add modal */}
      {showAdd && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowAdd(false); }}
        >
          <div
            className="w-full max-w-lg rounded-t-[20px] p-5 space-y-4 overflow-y-auto"
            style={{ background: "var(--surface-elevated)", maxHeight: "90vh" }}
          >
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-bold text-lg" style={{ color: "var(--fg)" }}>
                {t("recurring.add", lang)}
              </h2>
              <button onClick={() => setShowAdd(false)} style={{ color: "var(--fg-muted)" }} className="text-xl leading-none">×</button>
            </div>

            {/* Type toggle */}
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--fg-muted)" }}>
                {t("recurring.form.type", lang)}
              </label>
              <div className="flex gap-2">
                {(["expense", "income"] as TxType[]).map((tp) => (
                  <button
                    key={tp}
                    type="button"
                    onClick={() => { setAddType(tp); setAddCategoryId(""); }}
                    className="flex-1 py-2 text-sm font-semibold rounded-[10px] transition-all"
                    style={
                      addType === tp
                        ? { background: tp === "income" ? "var(--income-wash)" : "var(--expense-wash)", color: tp === "income" ? "var(--income)" : "var(--expense)", border: `1.5px solid ${tp === "income" ? "var(--income)" : "var(--expense)"}` }
                        : { background: "var(--surface-sunken)", color: "var(--fg-muted)", border: "1px solid var(--border)" }
                    }
                  >
                    {tp === "income" ? (lang === "ru" ? "Доход" : lang === "en" ? "Income" : "Kirim") : (lang === "ru" ? "Расход" : lang === "en" ? "Expense" : "Chiqim")}
                  </button>
                ))}
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--fg-muted)" }}>
                {t("recurring.form.category", lang)}
              </label>
              <select
                value={addCategoryId}
                onChange={(e) => setAddCategoryId(e.target.value)}
                className={inputCls}
                style={inputStyle}
              >
                <option value="">{lang === "ru" ? "Без категории" : lang === "en" ? "No category" : "Kategoriyasiz"}</option>
                {filteredCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ""}{c.name}</option>
                ))}
              </select>
            </div>

            {/* Amount */}
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--fg-muted)" }}>
                {t("recurring.form.amount", lang)}
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={addAmount}
                onChange={(e) => setAddAmount(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="500 000"
                className={inputCls}
                style={inputStyle}
              />
            </div>

            {/* Frequency */}
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--fg-muted)" }}>
                {t("recurring.form.frequency", lang)}
              </label>
              <div className="flex gap-2">
                {(["monthly", "yearly"] as Frequency[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setAddFrequency(f)}
                    className="flex-1 py-2 text-sm font-semibold rounded-[10px] transition-all"
                    style={
                      addFrequency === f
                        ? { background: "var(--accent-gradient)", color: "#fff" }
                        : { background: "var(--surface-sunken)", color: "var(--fg-muted)", border: "1px solid var(--border)" }
                    }
                  >
                    {f === "monthly" ? t("recurring.form.monthly", lang) : t("recurring.form.yearly", lang)}
                  </button>
                ))}
              </div>
            </div>

            {/* Day of month */}
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--fg-muted)" }}>
                {t("recurring.form.day_of_month", lang)}
              </label>
              <select
                value={addDay}
                onChange={(e) => setAddDay(Number(e.target.value))}
                className={inputCls}
                style={inputStyle}
              >
                {DAYS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            {/* Month of year (only for yearly) */}
            {addFrequency === "yearly" && (
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--fg-muted)" }}>
                  {t("recurring.form.month_of_year", lang)}
                </label>
                <select
                  value={addMonth}
                  onChange={(e) => setAddMonth(Number(e.target.value))}
                  className={inputCls}
                  style={inputStyle}
                >
                  {MONTHS.map((m) => (
                    <option key={m} value={m}>{monthNames[m - 1]}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Start date */}
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--fg-muted)" }}>
                {t("recurring.form.start_date", lang)}
              </label>
              <input
                type="date"
                value={addStartDate}
                onChange={(e) => setAddStartDate(e.target.value)}
                className={inputCls}
                style={inputStyle}
              />
            </div>

            {/* End date (optional) */}
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--fg-muted)" }}>
                {t("recurring.form.end_date", lang)}
              </label>
              <input
                type="date"
                value={addEndDate}
                onChange={(e) => setAddEndDate(e.target.value)}
                className={inputCls}
                style={inputStyle}
              />
            </div>

            {/* Note */}
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--fg-muted)" }}>
                {t("recurring.form.note", lang)}
              </label>
              <input
                type="text"
                value={addNote}
                onChange={(e) => setAddNote(e.target.value)}
                placeholder={lang === "ru" ? "Примечание..." : lang === "en" ? "Note..." : "Izoh..."}
                className={inputCls}
                style={inputStyle}
              />
            </div>

            {addError && (
              <p className="text-sm" style={{ color: "var(--expense)" }}>{addError}</p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowAdd(false)}
                className="flex-1 py-3 text-sm font-semibold rounded-[12px]"
                style={{ background: "var(--surface-sunken)", color: "var(--fg-muted)", border: "1px solid var(--border)" }}
              >
                {t("common.cancel", lang)}
              </button>
              <button
                onClick={handleAdd}
                disabled={addLoading || !addAmount.trim() || !addCategoryId}
                className="flex-1 py-3 text-sm font-semibold rounded-[12px] text-white disabled:opacity-60"
                style={{ background: "var(--accent-gradient)" }}
              >
                {addLoading ? t("form.submitting", lang) : t("common.save", lang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
