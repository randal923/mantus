import { actionBarHotkeyFromEvent } from "./actionBarHotkeyFromEvent";

interface ActionBarKeyboardEvent {
  readonly code: string;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
}

export function matchesActionBarHotkey(
  event: ActionBarKeyboardEvent,
  hotkey: string | null,
): boolean {
  return Boolean(hotkey && actionBarHotkeyFromEvent(event) === hotkey);
}
