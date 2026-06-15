"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { LangCode } from "@/lib/i18n/translate";
import { t } from "@/lib/i18n/translate";
import { Toast } from "@/components/Toast";
import type { ParsedTx } from "@/app/api/import/route";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AccountOption {
  id: string;
  name: string;
  type: string;
}

interface PreviewRow extends ParsedTx {
  /** client-only checkbox state */
  selected: boolean;
}

interface Props {
  accounts: AccountOption[];
  lang: LangCode;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatAmount(amountUzs: number, lang: LangCode): string {
  const parts: string[] = [];
  let rem = Math.abs(Math.round(amountUzs));
  if (rem === 0) return "0";
  while (rem >= 1000) {
    parts.unshift(String(rem % 1000).padStart(3, "0"));
    rem = Math.floor(rem / 1000);
  }
  parts.unshift(String(rem));
  const num = parts.join(" ");
  const suffix =
    lang === "ru" ? "сум" : lang === "en" ? "UZS" : "so'm";
  return `${num} ${suffix}`;
}

function fileTob64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the "data:...;base64," prefix
      const b64 = result.split(",")[1];
      resolve(b64);
    };
    reader.onerror = () => reject(new Error("FileReader error"));
    reader.readAsDataURL(file);
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ImportClient({ accounts, lang }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [accountId, setAccountId] = useState<string>(
    accounts.length === 1 ? accounts[0].id : ""
  );
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Preview state
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [hasParsed, setHasParsed] = useState(false);

  // Commit state
  const [committing, setCommitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") =>
    setToast({ msg, type });

  // ── Upload & parse ──────────────────────────────────────────────────────────
  const handleUpload = useCallback(async () => {
    setUploadError(null);

    if (!file) {
      setUploadError(t("import.error.no_file", lang));
      return;
    }
    if (!accountId) {
      setUploadError(t("import.error.no_account", lang));
      return;
    }

    // 10 MB guard
    if (file.size > 10 * 1024 * 1024) {
      setUploadError(t("import.error.too_large", lang));
      return;
    }

    setUploading(true);
    try {
      const fileBase64 = await fileTob64(file);
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileBase64,
          mimeType: file.type || "application/octet-stream",
          fileName: file.name,
        }),
      });

      const data = (await res.json()) as {
        transactions?: ParsedTx[];
        error?: string;
      };

      if (!res.ok) {
        setUploadError(t("import.error.generic", lang));
        return;
      }

      if (data.error === "nothing_parsed" || !data.transactions?.length) {
        setUploadError(t("import.error.nothing_parsed", lang));
        setRows([]);
        setHasParsed(true);
        return;
      }

      if (data.error === "parse_failed") {
        setUploadError(t("import.error.parse_failed", lang));
        setRows([]);
        setHasParsed(true);
        return;
      }

      setRows(data.transactions!.map((tx) => ({ ...tx, selected: true })));
      setHasParsed(true);
    } catch {
      setUploadError(t("import.error.generic", lang));
    } finally {
      setUploading(false);
    }
  }, [file, accountId, lang]);

  // ── Toggle row selection ────────────────────────────────────────────────────
  const toggleRow = (idx: number) =>
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, selected: !r.selected } : r))
    );

  const toggleAll = (val: boolean) =>
    setRows((prev) => prev.map((r) => ({ ...r, selected: val })));

  // ── Commit ──────────────────────────────────────────────────────────────────
  const selectedRows = rows.filter((r) => r.selected);

  const handleCommit = useCallback(async () => {
    if (selectedRows.length === 0) {
      showToast(t("import.empty_selection", lang), "error");
      return;
    }

    setCommitting(true);
    try {
      const res = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          transactions: selectedRows.map(({ selected: _s, ...tx }) => tx),
        }),
      });

      const data = (await res.json()) as { created?: number; error?: string };

      if (!res.ok || data.error) {
        showToast(t("import.error.generic", lang), "error");
        return;
      }

      const n = data.created ?? selectedRows.length;
      const successMsg = t("import.success", lang).replace("{n}", String(n));
      showToast(successMsg, "success");

      // Reset to allow a fresh import
      setRows([]);
      setFile(null);
      setHasParsed(false);
      if (fileRef.current) fileRef.current.value = "";

      // Refresh the page tree so account balances update
      router.refresh();
    } catch {
      showToast(t("import.error.generic", lang), "error");
    } finally {
      setCommitting(false);
    }
  }, [selectedRows, accountId, lang, router]);

  // ── Totals for preview summary ──────────────────────────────────────────────
  const selectedSum = selectedRows.reduce((s, r) => s + r.amountUzs, 0);

  // ── Styles (shared with AccountsClient pattern) ───────────────────────────
  const inputStyle = {
    border: "1px solid var(--border-strong)",
    background: "transparent",
    color: "var(--fg)",
  };
  const inputCls =
    "w-full rounded-[12px] px-3 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 min-h-[44px]";

  return (
    <>
      {toast && (
        <Toast message={toast.msg} type={toast.type} onDone={() => setToast(null)} />
      )}

      {/* ── Explanation card ── */}
      <div
        className="rounded-[14px] p-4 mb-6 text-sm leading-relaxed"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          color: "var(--fg-muted)",
        }}
      >
        {t("import.explanation", lang)}
      </div>

      {/* ── Upload form ── */}
      <div
        className="rounded-[14px] p-5 mb-6 space-y-4"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      >
        {/* File picker */}
        <div>
          <label
            className="block text-xs font-medium mb-1.5"
            style={{ color: "var(--fg-muted)" }}
          >
            {t("import.file_label", lang)}
          </label>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.xlsx,.xls,.csv,image/jpeg,image/png,image/webp"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setHasParsed(false);
              setRows([]);
              setUploadError(null);
            }}
            className={`${inputCls} cursor-pointer file:mr-3 file:py-1 file:px-3 file:rounded-lg file:text-xs file:font-medium file:border-0 file:cursor-pointer`}
            style={inputStyle}
          />
          <p className="mt-1 text-xs" style={{ color: "var(--fg-subtle)" }}>
            {t("import.file_hint", lang)}
          </p>
        </div>

        {/* Account selector */}
        <div>
          <label
            className="block text-xs font-medium mb-1.5"
            style={{ color: "var(--fg-muted)" }}
          >
            {t("import.account_label", lang)}
          </label>
          {accounts.length === 0 ? (
            <p className="text-sm py-2" style={{ color: "var(--fg-subtle)" }}>
              {t("account.empty.hint", lang)}
            </p>
          ) : (
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className={`${inputCls} appearance-none`}
              style={inputStyle}
            >
              <option value="" disabled>
                {t("import.account_placeholder", lang)}
              </option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Error banner */}
        {uploadError && (
          <div
            className="text-sm px-3 py-2 rounded-[12px]"
            style={{
              background: "var(--expense-wash)",
              color: "var(--expense)",
            }}
          >
            {uploadError}
          </div>
        )}

        {/* AI cost note */}
        <p className="text-xs" style={{ color: "var(--fg-subtle)" }}>
          {t("import.ai_note", lang)}
        </p>

        {/* Upload button */}
        <button
          onClick={handleUpload}
          disabled={uploading || !file || !accountId}
          className="w-full py-3 rounded-[14px] text-sm font-semibold transition-all min-h-[44px] disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {uploading ? t("import.uploading", lang) : t("import.upload_btn", lang)}
        </button>
      </div>

      {/* ── Preview section ── */}
      {hasParsed && rows.length > 0 && (
        <div
          className="rounded-[14px] p-5 space-y-4"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          {/* Header row: title + select/deselect all */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-semibold text-base" style={{ color: "var(--fg)" }}>
                {t("import.preview_title", lang)}
              </h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--fg-subtle)" }}>
                {t("import.preview_count", lang).replace("{n}", String(rows.length))}
                {" · "}
                {t("import.preview_sum", lang).replace(
                  "{sum}",
                  formatAmount(selectedSum, lang)
                )}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => toggleAll(true)}
                className="text-xs px-3 py-1.5 rounded-[8px] min-h-[36px]"
                style={{
                  border: "1px solid var(--border)",
                  color: "var(--fg-muted)",
                }}
              >
                {t("import.select_all", lang)}
              </button>
              <button
                onClick={() => toggleAll(false)}
                className="text-xs px-3 py-1.5 rounded-[8px] min-h-[36px]"
                style={{
                  border: "1px solid var(--border)",
                  color: "var(--fg-muted)",
                }}
              >
                {t("import.deselect_all", lang)}
              </button>
            </div>
          </div>

          {/* Transaction rows */}
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {rows.map((row, idx) => (
              <label
                key={idx}
                className="flex items-start gap-3 p-3 rounded-[12px] cursor-pointer transition-all"
                style={{
                  background: row.selected
                    ? "var(--surface-sunken)"
                    : "transparent",
                  border: `1px solid ${row.selected ? "var(--border)" : "var(--border)"}`,
                  opacity: row.selected ? 1 : 0.5,
                }}
              >
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={row.selected}
                  onChange={() => toggleRow(idx)}
                  className="mt-0.5 shrink-0 w-4 h-4 cursor-pointer"
                  style={{ accentColor: "var(--accent)" }}
                />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Date */}
                    <span
                      className="text-xs tabular"
                      style={{ color: "var(--fg-subtle)" }}
                    >
                      {row.date}
                    </span>

                    {/* Type badge */}
                    <span
                      className="text-xs px-1.5 py-0.5 rounded-[6px] font-medium"
                      style={
                        row.type === "income"
                          ? {
                              background: "var(--income-wash)",
                              color: "var(--income)",
                            }
                          : {
                              background: "var(--expense-wash)",
                              color: "var(--expense)",
                            }
                      }
                    >
                      {t(`import.${row.type}`, lang)}
                    </span>

                    {/* Category */}
                    <span
                      className="text-xs px-1.5 py-0.5 rounded-[6px]"
                      style={{
                        background: "var(--surface-sunken)",
                        color: "var(--fg-muted)",
                      }}
                    >
                      {row.category}
                    </span>
                  </div>

                  {/* Note */}
                  {row.note && (
                    <p
                      className="text-xs mt-1 truncate"
                      style={{ color: "var(--fg-muted)" }}
                    >
                      {row.note}
                    </p>
                  )}
                </div>

                {/* Amount — right-aligned */}
                <div className="shrink-0 text-right">
                  <p
                    className="text-sm font-semibold tabular"
                    style={{
                      color:
                        row.type === "income"
                          ? "var(--income)"
                          : "var(--expense)",
                    }}
                  >
                    {row.type === "income" ? "+" : "−"}
                    {formatAmount(row.amountUzs, lang)}
                  </p>
                </div>
              </label>
            ))}
          </div>

          {/* Confirm button */}
          <button
            onClick={handleCommit}
            disabled={committing || selectedRows.length === 0}
            className="w-full py-3 rounded-[14px] text-sm font-semibold transition-all min-h-[44px] disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {committing
              ? t("import.confirming", lang)
              : t("import.confirm_btn", lang).replace(
                  "{n}",
                  String(selectedRows.length)
                )}
          </button>
        </div>
      )}

      {/* ── Empty state after parse with no results ── */}
      {hasParsed && rows.length === 0 && !uploadError && (
        <div
          className="rounded-[14px] py-12 flex flex-col items-center gap-2"
          style={{
            background: "var(--surface)",
            border: "1px dashed var(--border-strong)",
          }}
        >
          <span style={{ fontSize: 36 }}>📄</span>
          <p className="font-medium" style={{ color: "var(--fg-muted)" }}>
            {t("import.error.nothing_parsed", lang)}
          </p>
        </div>
      )}
    </>
  );
}
