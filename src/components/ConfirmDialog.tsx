"use client";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = true,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
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
        className="w-full max-w-md rounded-[var(--radius-lg)] p-6 space-y-4"
        style={{
          background: "var(--surface-elevated)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-lg)",
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <div className="flex items-start justify-between gap-3">
          <h3
            id="confirm-dialog-title"
            className="font-bold text-base"
            style={{ color: "var(--fg)" }}
          >
            {title}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="p-1.5 rounded-lg transition-all disabled:opacity-40"
            style={{ color: "var(--fg-subtle)" }}
            aria-label={cancelLabel}
          >
            ✕
          </button>
        </div>

        <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
          {message}
        </p>

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
            disabled={loading}
            className="flex-1 py-2.5 rounded-[12px] text-sm font-semibold transition-all disabled:opacity-60"
            style={
              danger
                ? { background: "var(--expense)", color: "#fff" }
                : { background: "var(--accent)", color: "#fff" }
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
