"use client";

import { useEffect, useMemo, useState } from "react";

interface TypedDeleteDialogProps {
  open: boolean;
  title: string;
  warning: string;
  description: string;
  extraWarning?: string;
  targetLabel?: string;
  requiredWord: string;
  inputLabel: string;
  instruction: string;
  confirmLabel: string;
  cancelLabel: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function TypedDeleteDialog({
  open,
  title,
  warning,
  description,
  extraWarning,
  targetLabel,
  requiredWord,
  inputLabel,
  instruction,
  confirmLabel,
  cancelLabel,
  loading = false,
  onCancel,
  onConfirm,
}: TypedDeleteDialogProps) {
  const [typedValue, setTypedValue] = useState("");

  useEffect(() => {
    if (open) setTypedValue("");
  }, [open, requiredWord]);

  const isConfirmed = useMemo(
    () =>
      typedValue.trim().toLocaleLowerCase() ===
      requiredWord.trim().toLocaleLowerCase(),
    [typedValue, requiredWord]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.58)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onCancel();
      }}
    >
      <div
        className="w-full max-w-md rounded-[12px] p-6 space-y-4"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="typed-delete-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h3
              id="typed-delete-title"
              className="font-bold text-base"
              style={{ color: "var(--fg)" }}
            >
              {title}
            </h3>
            {targetLabel && (
              <p className="text-sm font-medium" style={{ color: "var(--fg-muted)" }}>
                {targetLabel}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="p-1.5 rounded-lg transition-all disabled:opacity-40"
            style={{ color: "var(--fg-subtle)" }}
            aria-label={cancelLabel}
          >
            x
          </button>
        </div>

        <div
          className="rounded-[12px] px-3 py-3 text-sm space-y-1"
          style={{ background: "var(--expense-wash)", color: "var(--expense)" }}
        >
          <p className="font-semibold">{warning}</p>
          <p>{description}</p>
          {extraWarning && <p className="font-medium">{extraWarning}</p>}
        </div>

        <div className="space-y-2">
          <label
            className="block text-xs font-medium"
            htmlFor="typed-delete-input"
            style={{ color: "var(--fg-muted)" }}
          >
            {inputLabel}
          </label>
          <p className="text-sm" style={{ color: "var(--fg-subtle)" }}>
            {instruction.replace("{word}", `"${requiredWord}"`)}
          </p>
          <input
            id="typed-delete-input"
            autoFocus
            type="text"
            value={typedValue}
            onChange={(e) => setTypedValue(e.target.value)}
            disabled={loading}
            className="w-full rounded-[12px] px-3 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 disabled:opacity-60"
            style={{
              border: "1px solid var(--border-strong)",
              background: "transparent",
              color: "var(--fg)",
            }}
            placeholder={requiredWord}
          />
        </div>

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 rounded-[12px] text-sm font-semibold transition-all disabled:opacity-60"
            style={{ border: "1px solid var(--border)", color: "var(--fg-muted)" }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading || !isConfirmed}
            className="flex-1 py-2.5 rounded-[12px] text-sm font-semibold transition-all disabled:opacity-45"
            style={{ background: "var(--expense)", color: "#fff" }}
          >
            {loading ? confirmLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
