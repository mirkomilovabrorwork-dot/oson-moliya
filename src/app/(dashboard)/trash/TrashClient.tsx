"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { LangCode } from "@/lib/i18n/translate";
import { t } from "@/lib/i18n/translate";
import { Toast } from "@/components/Toast";

// ── Row types (BigInt already serialized to string by page.tsx) ──────────────

interface TxRow {
  id: string;
  type: "income" | "expense";
  amountUzs: string;
  note: string | null;
  occurredAt: string;
  deletedAt: string;
  category: { name: string; emoji: string | null } | null;
}

interface DebtRow {
  id: string;
  counterparty: string;
  amountUzs: string;
  direction: "given" | "taken";
  deletedAt: string;
}

interface RuleRow {
  id: string;
  type: "income" | "expense";
  amountUzs: string;
  note: string | null;
  frequency: string;
  deletedAt: string;
  category: { name: string; emoji: string | null } | null;
}

interface Props {
  transactions: TxRow[];
  debts: DebtRow[];
  recurringRules: RuleRow[];
  lang: LangCode;
}

function formatDeletedAt(iso: string, lang: LangCode): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const locale = lang === "ru" ? "ru-RU" : lang === "en" ? "en-GB" : "uz-Latn-UZ";
  return d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatAmount(amountUzs: string): string {
  try {
    const n = BigInt(amountUzs);
    // Space-group for thousands
    return n.toLocaleString("uz-Latn-UZ").replace(/,/g, " ");
  } catch {
    return amountUzs;
  }
}

// ── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide px-1" style={{ color: "var(--fg-subtle)" }}>
        {title}
      </h2>
      <div
        className="rounded-[var(--radius-lg)] overflow-hidden"
        style={{ background: "var(--surface-elevated)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
      >
        {children}
      </div>
    </div>
  );
}

// ── TrashClient ──────────────────────────────────────────────────────────────

export function TrashClient({ transactions: initialTx, debts: initialDebts, recurringRules: initialRules, lang }: Props) {
  const router = useRouter();

  const [transactions, setTransactions] = useState<TxRow[]>(initialTx);
  const [debts, setDebts] = useState<DebtRow[]>(initialDebts);
  const [rules, setRules] = useState<RuleRow[]>(initialRules);

  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const showToast = (msg: string, type: "success" | "error" = "success") => setToast({ msg, type });

  const [restoringId, setRestoringId] = useState<string | null>(null);

  const handleRestore = async (entity: "transactions" | "debts" | "recurring", id: string) => {
    setRestoringId(id);
    try {
      const res = await fetch(`/api/${entity}/${id}/restore`, { method: "POST" });
      if (!res.ok) throw new Error();
      if (entity === "transactions") setTransactions((prev) => prev.filter((r) => r.id !== id));
      else if (entity === "debts") setDebts((prev) => prev.filter((r) => r.id !== id));
      else setRules((prev) => prev.filter((r) => r.id !== id));
      showToast(t("undo.restored", lang));
      router.refresh();
    } catch {
      showToast(t("error.generic", lang), "error");
    } finally {
      setRestoringId(null);
    }
  };

  const isEmpty = transactions.length === 0 && debts.length === 0 && rules.length === 0;

  const restoreBtn = (entity: "transactions" | "debts" | "recurring", id: string) => (
    <button
      onClick={() => handleRestore(entity, id)}
      disabled={restoringId === id}
      className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all disabled:opacity-50"
      style={{ background: "var(--accent-wash)", color: "var(--accent)", border: "1px solid var(--accent)" }}
    >
      {restoringId === id ? "..." : t("trash.restore", lang)}
    </button>
  );

  return (
    <div className="space-y-5">
      {toast && (
        <Toast message={toast.msg} type={toast.type} onDone={() => setToast(null)} />
      )}

      {/* Retention note */}
      <p className="text-xs px-1" style={{ color: "var(--fg-subtle)" }}>
        🗑 {t("trash.retention_note", lang)}
      </p>

      {isEmpty ? (
        <div
          className="rounded-[var(--radius-lg)] py-16 text-center"
          style={{ background: "var(--surface-elevated)", border: "1px solid var(--border)" }}
        >
          <p className="text-sm font-medium" style={{ color: "var(--fg-muted)" }}>
            {t("trash.empty", lang)}
          </p>
        </div>
      ) : (
        <>
          {/* Transactions section */}
          {transactions.length > 0 && (
            <Section title={t("trash.section.transactions", lang)}>
              {transactions.map((tx, idx) => (
                <div
                  key={tx.id}
                  className="flex items-center gap-3 px-4 py-3.5"
                  style={{ borderTop: idx === 0 ? undefined : "1px solid var(--border)" }}
                >
                  <span
                    className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 text-sm"
                    style={{ background: "var(--surface-sunken)", color: "var(--fg-muted)" }}
                  >
                    {tx.category?.emoji ?? (tx.type === "income" ? "+" : "−")}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--fg)" }}>
                      {tx.category?.name ?? (tx.type === "income" ? t("form.type.income", lang) : t("form.type.expense", lang))}
                      {" · "}
                      <span style={{ color: tx.type === "income" ? "var(--income)" : "var(--expense)" }}>
                        {tx.type === "income" ? "+" : "−"}{formatAmount(tx.amountUzs)}
                      </span>
                    </p>
                    <p className="text-xs" style={{ color: "var(--fg-subtle)" }}>
                      {t("trash.deleted_at", lang).replace("{date}", formatDeletedAt(tx.deletedAt, lang))}
                    </p>
                  </div>
                  {restoreBtn("transactions", tx.id)}
                </div>
              ))}
            </Section>
          )}

          {/* Debts section */}
          {debts.length > 0 && (
            <Section title={t("trash.section.debts", lang)}>
              {debts.map((debt, idx) => (
                <div
                  key={debt.id}
                  className="flex items-center gap-3 px-4 py-3.5"
                  style={{ borderTop: idx === 0 ? undefined : "1px solid var(--border)" }}
                >
                  <span
                    className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 text-sm"
                    style={{ background: "var(--surface-sunken)", color: "var(--fg-muted)" }}
                  >
                    {debt.direction === "given" ? "↗" : "↘"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--fg)" }}>
                      {debt.counterparty}
                      {" · "}
                      {formatAmount(debt.amountUzs)}
                    </p>
                    <p className="text-xs" style={{ color: "var(--fg-subtle)" }}>
                      {t("trash.deleted_at", lang).replace("{date}", formatDeletedAt(debt.deletedAt, lang))}
                    </p>
                  </div>
                  {restoreBtn("debts", debt.id)}
                </div>
              ))}
            </Section>
          )}

          {/* Recurring section */}
          {rules.length > 0 && (
            <Section title={t("trash.section.recurring", lang)}>
              {rules.map((rule, idx) => (
                <div
                  key={rule.id}
                  className="flex items-center gap-3 px-4 py-3.5"
                  style={{ borderTop: idx === 0 ? undefined : "1px solid var(--border)" }}
                >
                  <span
                    className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 text-sm"
                    style={{ background: "var(--surface-sunken)", color: "var(--fg-muted)" }}
                  >
                    {rule.category?.emoji ?? "↻"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--fg)" }}>
                      {rule.category?.name ?? (rule.note ?? t("common.loading", lang))}
                      {" · "}
                      <span style={{ color: rule.type === "income" ? "var(--income)" : "var(--expense)" }}>
                        {rule.type === "income" ? "+" : "−"}{formatAmount(rule.amountUzs)}
                      </span>
                    </p>
                    <p className="text-xs" style={{ color: "var(--fg-subtle)" }}>
                      {t("trash.deleted_at", lang).replace("{date}", formatDeletedAt(rule.deletedAt, lang))}
                    </p>
                  </div>
                  {restoreBtn("recurring", rule.id)}
                </div>
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}
