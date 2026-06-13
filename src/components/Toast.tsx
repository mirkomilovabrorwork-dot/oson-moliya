"use client";

import { useEffect, useState } from "react";

interface ToastProps {
  message: string;
  type?: "success" | "error" | "info";
  onDone?: () => void;
  duration?: number;
}

export function Toast({ message, type = "info", onDone, duration = 3000 }: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      onDone?.();
    }, duration);
    return () => clearTimeout(t);
  }, [duration, onDone]);

  if (!visible) return null;

  const style =
    type === "success"
      ? { background: "var(--income-wash)", color: "var(--income)", border: "1px solid var(--income)" }
      : type === "error"
      ? { background: "var(--expense-wash)", color: "var(--expense)", border: "1px solid var(--expense)" }
      : { background: "var(--accent-wash)", color: "var(--accent)", border: "1px solid var(--accent)" };

  return (
    <div
      className="fixed bottom-5 right-4 z-50 px-4 py-3 rounded-[10px] text-sm font-medium max-w-xs"
      style={style}
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
}
