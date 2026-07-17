import type { Direction } from "@tibia/protocol";

const KEY_DIRECTIONS: Readonly<Record<string, Direction>> = {
  ArrowUp: "north",
  ArrowRight: "east",
  ArrowDown: "south",
  ArrowLeft: "west",
  KeyW: "north",
  KeyD: "east",
  KeyS: "south",
  KeyA: "west",
  Numpad7: "northwest",
  Numpad9: "northeast",
  Numpad1: "southwest",
  Numpad3: "southeast",
};

const KEY_VECTORS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [0, -1],
  ArrowRight: [1, 0],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  KeyW: [0, -1],
  KeyD: [1, 0],
  KeyS: [0, 1],
  KeyA: [-1, 0],
};

export function getHeldMovementDirection(
  heldMovementKeys: ReadonlyArray<string>,
  allowDiagonal: boolean,
): Direction | null {
  const activeKey = heldMovementKeys[heldMovementKeys.length - 1];
  if (!activeKey) return null;
  const activeDirection = KEY_DIRECTIONS[activeKey];
  if (!activeDirection) return null;
  if (!allowDiagonal) {
    return KEY_VECTORS[activeKey] ? activeDirection : null;
  }
  if (!KEY_VECTORS[activeKey]) return activeDirection;

  let horizontal = 0;
  let vertical = 0;
  for (const key of heldMovementKeys) {
    const vector = KEY_VECTORS[key];
    if (!vector) continue;
    if (vector[0] !== 0) horizontal = vector[0];
    if (vector[1] !== 0) vertical = vector[1];
  }
  if (horizontal === 1 && vertical === -1) return "northeast";
  if (horizontal === 1 && vertical === 1) return "southeast";
  if (horizontal === -1 && vertical === 1) return "southwest";
  if (horizontal === -1 && vertical === -1) return "northwest";
  return activeDirection;
}
