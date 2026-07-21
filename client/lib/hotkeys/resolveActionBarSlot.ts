interface ActionBarKeyEvent {
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly repeat: boolean;
}

export function resolveActionBarSlot(
  event: ActionBarKeyEvent,
  modifier?: "shift",
): number | null {
  const shiftMatches = modifier === "shift" ? event.shiftKey : !event.shiftKey;
  if (
    event.repeat ||
    !shiftMatches ||
    event.ctrlKey ||
    event.altKey ||
    event.metaKey
  ) {
    return null;
  }
  const match = /^Digit([1-9])$/.exec(event.code);
  return match ? Number(match[1]) - 1 : null;
}
