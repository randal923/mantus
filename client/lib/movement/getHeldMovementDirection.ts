import type { Direction } from "@tibia/protocol";

const DIRECTION_VECTORS: Readonly<
  Partial<Record<Direction, readonly [number, number]>>
> = {
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
};

export function getHeldMovementDirection(
  heldMovementKeys: ReadonlyArray<string>,
  allowDiagonal: boolean,
  keyDirections: Readonly<Record<string, Direction>>,
): Direction | null {
  const activeKey = heldMovementKeys[heldMovementKeys.length - 1];
  if (!activeKey) return null;
  const activeDirection = keyDirections[activeKey];
  if (!activeDirection) return null;
  const activeVector = DIRECTION_VECTORS[activeDirection];
  if (!allowDiagonal) {
    return activeVector ? activeDirection : null;
  }
  if (!activeVector) return activeDirection;

  let horizontal = 0;
  let vertical = 0;
  for (const key of heldMovementKeys) {
    const direction = keyDirections[key];
    const vector = direction ? DIRECTION_VECTORS[direction] : undefined;
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
