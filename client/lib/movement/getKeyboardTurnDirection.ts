import type { Direction } from "@tibia/protocol";

const TURN_DIRECTIONS: Readonly<Record<string, Direction>> = {
  KeyW: "north",
  KeyD: "east",
  KeyS: "south",
  KeyA: "west",
};

export function getKeyboardTurnDirection(
  event: Pick<KeyboardEvent, "code" | "shiftKey">,
): Direction | null {
  if (!event.shiftKey) return null;
  return TURN_DIRECTIONS[event.code] ?? null;
}
