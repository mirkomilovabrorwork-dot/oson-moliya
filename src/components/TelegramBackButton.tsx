"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

interface TelegramBackButton {
  show?: () => void;
  hide?: () => void;
  onClick?: (fn: () => void) => void;
  offClick?: (fn: () => void) => void;
}

/**
 * TelegramBackButton — mounted once in the root layout.
 *
 * Manages Telegram's native back button so that pressing it navigates
 * within the app instead of closing the whole Mini App.
 *
 * Outside Telegram (no window.Telegram.WebApp) this component is a no-op.
 */
export function TelegramBackButton() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const twa = (
      window as Window & {
        Telegram?: { WebApp?: { BackButton?: TelegramBackButton } };
      }
    ).Telegram?.WebApp;

    const backButton = twa?.BackButton;
    if (!backButton) return; // Not inside Telegram — nothing to do

    const isRoot = pathname === "/" || pathname === "/login";

    const handler = () => {
      if (typeof window !== "undefined" && window.history.length > 1) {
        router.back();
      } else {
        router.push("/");
      }
    };

    if (isRoot) {
      backButton.hide?.();
    } else {
      backButton.show?.();
      backButton.onClick?.(handler);
    }

    return () => {
      backButton.offClick?.(handler);
    };
  }, [pathname, router]);

  return null;
}
