"use client";

import { useEffect } from "react";

const AUTO_DISMISS_MS = 4000;

interface ToastProps {
  message: string;
  onDismiss: () => void;
  autoDismissMs?: number;
}

export function Toast({
  message,
  onDismiss,
  autoDismissMs = AUTO_DISMISS_MS,
}: ToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, autoDismissMs);
    return () => window.clearTimeout(timer);
  }, [autoDismissMs, message, onDismiss]);

  return (
    <button
      type="button"
      role="status"
      aria-live="polite"
      onClick={onDismiss}
      className="ui-panel-frame fixed top-24 left-1/2 z-[60] max-w-md -translate-x-1/2 px-4 py-3 font-tibia text-sm text-ui-text-bright"
    >
      {message}
    </button>
  );
}
