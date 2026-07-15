const GROUND_FLOOR = 7;
const MAX_FLOOR = 15;
const UNDERGROUND_FLOOR_AWARENESS = 2;

export function getVisibleFloors(playerFloor: number): number[] {
  if (!Number.isInteger(playerFloor) || playerFloor < 0 || playerFloor > MAX_FLOOR) {
    throw new Error(`player floor ${playerFloor} is out of range`);
  }
  if (playerFloor <= GROUND_FLOOR) {
    return Array.from({ length: GROUND_FLOOR + 1 }, (_, index) =>
      GROUND_FLOOR - index,
    );
  }
  const first = Math.max(
    GROUND_FLOOR + 1,
    playerFloor - UNDERGROUND_FLOOR_AWARENESS,
  );
  const last = Math.min(
    MAX_FLOOR,
    playerFloor + UNDERGROUND_FLOOR_AWARENESS,
  );
  return Array.from({ length: last - first + 1 }, (_, index) => last - index);
}
