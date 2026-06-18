"use client";

import { useState, useEffect } from "react";
import type { LangCode } from "@/lib/i18n/translate";
import { t } from "@/lib/i18n/translate";

interface BulkDeleteDialogProps {
  open: boolean;
  count: number;
  itemsPreview: string[];
  loading?: boolean;
  lang: LangCode;
  onConfirm: () => void;
  onCancel: () => void;
}

const PREVIEW_MAX = 5;

export function BulkDeleteDialog({
  open,
  count,
  itemsPreview,
  loading = false,
  lang,
  onConfirm,
  onCancel,
}: BulkDeleteDialogProps) {
  const [checked, setChecked] = useState(false);

  // Reset checkbox whenever dialog opens
  useEffect(() => {
    if (open) setChecked(false);
  }, [open]);

  if (!open) return null;

  const previewItems = itemsPreview.slice(0, PREVIEW_MAX);
  const extraCount = itemsPreview.length - PREVIEW_MAX;

  // Build title: replace {n}
  const titleStr = t("bulk.confirm_title", lang).replace("{n}", String(count));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.58)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onCancel();
      }}
    >
      <div
        className="w-full max-w-md rounded-[var(--radius-lg)] p-6 space-y-4"
        style={{
          background: "var(--surface-elevated)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-lg)",
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-delete-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <h3
            id="bulk-delete-title"
            className="font-bold text-base"
            style={{ color: "var(--fg)" }}
          >
            {titleStr}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="p-1.5 rounded-lg transition-all disabled:opacity-40"
            style={{ color: "var(--fg-subtle)" }}
            aria-label={t("bulk.cancel", lang)}
          >
            ✕
          </button>
        </div>

        {/* Preview list */}
        <div
          className="rounded-[12px] px-3 py-3 space-y-1.5"
          style={{ background: "var(--expense-wash)", border: "1px solid var(--expense)" }}
        >
          {previewItems.map((label, i) => (
            <p key={i} className="text-sm font-medium truncate" style={{ color: "var(--expense)" }}>
              {label}
            </p>
          ))}
          {extraCount > 0 && (
            <p className="text-xs" style={{ color: "var(--expense)" }}>
              {t("bulk.preview_more", lang).replace("{n}", String(extraCount))}
            </p>
          )}
        </div>

        {/* Roziman checkbox — must be ticked to enable Delete */}
        <label
          className="flex items-start gap-3 cursor-pointer select-none"
          style={{ opacity: loading ? 0.5 : 1 }}
        >
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            disabled={loading}
            className="mt-0.5 shrink-0"
            style={{ accentColor: "var(--expense)", width: 18, height: 18 }}
          />
          <span className="text-sm" style={{ color: "var(--fg-muted)" }}>
            {t("bulk.confirm_checkbox", lang)}
          </span>
        </label>

        {/* Buttons */}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 rounded-[12px] text-sm font-semibold transition-all disabled:opacity-60"
            style={{ border: "1px solid var(--border)", color: "var(--fg-muted)" }}
          >
            {t("bulk.cancel", lang)}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading || !checked}
            className="flex-1 py-2.5 rounded-[12px] text-sm font-semibold transition-all disabled:opacity-40"
            style={{ background: "var(--expense)", color: "#fff" }}
          >
            {t("bulk.delete", lang)}
          </button>
        </div>
      </div>
    </div>
  );
}
