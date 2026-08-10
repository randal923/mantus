"use client";

import { useState } from "react";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { formatKeyBinding } from "../../lib/hotkeys/formatKeyBinding";
import { serializeKeyBindingEvent } from "../../lib/hotkeys/serializeKeyBindingEvent";

interface KeyBindingCaptureButtonProps {
  readonly label: string;
  readonly binding: string | null;
  /** Movement bindings are held-key codes; modifiers are stripped. */
  readonly bareKeyOnly?: boolean;
  readonly onChange: (binding: string | null) => void;
}

export function KeyBindingCaptureButton({
  label,
  binding,
  bareKeyOnly = false,
  onChange,
}: KeyBindingCaptureButtonProps) {
  const { t } = useAppTranslation();
  const [capturing, setCapturing] = useState(false);
  return (
    <button
      type="button"
      aria-label={t("hotkeys.inputLabel", { action: label })}
      onClick={() => setCapturing(true)}
      onBlur={() => setCapturing(false)}
      onKeyDown={(event) => {
        if (!capturing) return;
        event.preventDefault();
        // Keep the pressed key away from movement, modal-close, and other
        // window-level game listeners while it is being captured.
        event.stopPropagation();
        if (event.key === "Escape") {
          setCapturing(false);
          return;
        }
        if (event.key === "Backspace" || event.key === "Delete") {
          onChange(null);
          setCapturing(false);
          return;
        }
        if (
          event.code === "Tab" ||
          event.code === "Enter" ||
          event.code === "NumpadEnter"
        ) {
          // Reserved for focus navigation and chat.
          return;
        }
        const combo = serializeKeyBindingEvent(
          bareKeyOnly
            ? {
                code: event.code,
                altKey: false,
                ctrlKey: false,
                metaKey: false,
                shiftKey: false,
              }
            : event,
        );
        if (!combo) return;
        onChange(combo);
        setCapturing(false);
      }}
      className={`flex h-9 w-40 shrink-0 items-center justify-center rounded border bg-black/35 px-2 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ui-gold/60 ${
        capturing
          ? "border-ui-gold text-ui-gold"
          : binding
            ? "border-ui-stone-light/25 text-ui-text"
            : "border-ui-stone-light/25 text-ui-muted"
      }`}
    >
      <span className="truncate">
        {capturing
          ? t("hotkeys.pressKey")
          : formatKeyBinding(binding) || t("hotkeys.unassigned")}
      </span>
    </button>
  );
}
