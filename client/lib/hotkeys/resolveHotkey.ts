import { HOTKEY_BINDINGS, type HotkeyAction } from "./hotkeyBindings";

interface HotkeyKeyEvent {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
}

export function resolveHotkey(event: HotkeyKeyEvent): HotkeyAction | null {
  if (event.repeat) return null;
  if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
    return null;
  }
  return HOTKEY_BINDINGS[event.code] ?? null;
}
