"use client";

import { useEffect } from "react";

const AUTO_DISMISS_MS = 4000;

interface ToastProps {
  message: string;
  onDismiss: () => void;
}

export function Toast({ message, onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss]);

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
