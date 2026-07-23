import type { ActionBarHotkey } from "@tibia/protocol";

interface ActionBarKeyboardEvent {
  readonly code: string;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
}

export function actionBarHotkeyFromEvent(
  event: ActionBarKeyboardEvent,
): ActionBarHotkey | null {
  if (
    event.code === "Escape" ||
    event.code === "Enter" ||
    event.code === "Tab" ||
    event.code === "Backspace" ||
    event.code.startsWith("Alt") ||
    event.code.startsWith("Control") ||
    event.code.startsWith("Meta") ||
    event.code.startsWith("Shift") ||
    event.code.startsWith("Arrow") ||
    (!event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      ["KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code))
  ) {
    return null;
  }
  const modifiers = [
    event.altKey ? "Alt" : null,
    event.ctrlKey ? "Control" : null,
    event.metaKey ? "Meta" : null,
    event.shiftKey ? "Shift" : null,
  ].filter((value): value is string => value !== null);
  return [...modifiers, event.code].join("+");
}
