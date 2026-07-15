"use client";

import { useEffect, useRef } from "react";
import type { HotkeyAction } from "../lib/hotkeys/hotkeyBindings";
import { isEditableTarget } from "../lib/hotkeys/isEditableTarget";
import { resolveHotkey } from "../lib/hotkeys/resolveHotkey";

export function useHotkeys(onAction: (action: HotkeyAction) => void) {
  const onActionRef = useRef(onAction);

  useEffect(() => {
    onActionRef.current = onAction;
  }, [onAction]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const action = resolveHotkey(event);
      if (!action) return;
      event.preventDefault();
      onActionRef.current(action);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
