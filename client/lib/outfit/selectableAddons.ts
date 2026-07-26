/**
 * Which addon checkboxes may be toggled for an outfit, from the *granted*
 * addon bitmask the server reported (bit 0 = first addon, bit 1 = second).
 * The server refuses a selection carrying an ungranted bit outright rather
 * than silently dropping it, so ungranted checkboxes must be disabled and
 * any prior selection clamped with `clampAddonsToGranted` before sending.
 */
export function selectableAddons(granted: number): {
  readonly first: boolean;
  readonly second: boolean;
} {
  return {
    first: (granted & 1) === 1,
    second: (granted & 2) === 2,
  };
}

export function clampAddonsToGranted(
  selection: number,
  granted: number,
): number {
  return selection & granted & 3;
}
