import {
  isMovementBindingAction,
  type HotkeyAction,
  type KeyBindingAction,
  type KeyBindings,
} from "./keyBindings";
import { serializeKeyBindingEvent } from "./serializeKeyBindingEvent";

interface HotkeyKeyEvent {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
}

export function resolveHotkey(
  event: HotkeyKeyEvent,
  bindings: KeyBindings,
): HotkeyAction | null {
  if (event.repeat) return null;
  const combo = serializeKeyBindingEvent(event);
  if (!combo) return null;
  for (const action of Object.keys(bindings) as KeyBindingAction[]) {
    if (bindings[action] !== combo) continue;
    if (isMovementBindingAction(action)) continue;
    return action;
  }
  return null;
}
