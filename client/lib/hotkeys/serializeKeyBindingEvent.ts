interface KeyBindingKeyboardEvent {
  readonly code: string;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
}

/** Null for a bare modifier press; modifiers serialize in a fixed order. */
export function serializeKeyBindingEvent(
  event: KeyBindingKeyboardEvent,
): string | null {
  if (
    event.code === "" ||
    event.code.startsWith("Alt") ||
    event.code.startsWith("Control") ||
    event.code.startsWith("Meta") ||
    event.code.startsWith("Shift")
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
