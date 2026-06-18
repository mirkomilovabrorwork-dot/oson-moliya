"use client";

import { useEffect, useState } from "react";

interface ToastProps {
  message: string;
  type?: "success" | "error" | "info";
  onDone?: () => void;
  duration?: number;
  /** Optional label for an action button (e.g. "Undo"). When set, duration defaults to 6000ms. */
  actionLabel?: string;
  /** Called when the action button is tapped; toast dismisses immediately after. */
  onAction?: () => void;
}

export function Toast({
  message,
  type = "info",
  onDone,
  duration,
  actionLabel,
  onAction,
}: ToastProps) {
  // If an action is present use a longer default so the user has time to tap Undo.
  const effectiveDuration = duration ?? (actionLabel ? 6000 : 3000);
  const [visible, setVisible] = useState(true);

  const dismiss = () => {
    setVisible(false);
    onDone?.();
  };

  useEffect(() => {
    const timer = setTimeout(dismiss, effectiveDuration);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveDuration]);

  if (!visible) return null;

  const style =
    type === "success"
      ? { background: "var(--income-wash)", color: "var(--income)", border: "1px solid var(--income)" }
      : type === "error"
      ? { background: "var(--expense-wash)", color: "var(--expense)", border: "1px solid var(--expense)" }
      : { background: "var(--accent-wash)", color: "var(--accent)", border: "1px solid var(--accent)" };

  return (
    <div
      className="fixed bottom-5 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-[10px] text-sm font-medium max-w-xs"
      style={style}
      role="status"
      aria-live="polite"
    >
      <span className="flex-1">{message}</span>
      {actionLabel && onAction && (
        <button
          onClick={() => {
            onAction();
            dismiss();
          }}
          className="shrink-0 font-semibold underline underline-offset-2 focus:outline-none"
          style={{ color: "inherit" }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
