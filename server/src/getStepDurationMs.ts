const SPEED_A = 857.36;
const SPEED_B = 261.29;
const SPEED_C = -4_795.01;
const DIAGONAL_COST = 3;

export function getStepDurationMs(
  stepSpeed: number,
  groundSpeed: number,
  tickMs: number,
  diagonal = false,
): number {
  if (stepSpeed <= 0 || groundSpeed <= 0 || tickMs <= 0) {
    throw new Error("step speed, ground speed, and tick duration must be positive");
  }
  const calculatedSpeed = Math.max(
    1,
    Math.floor(SPEED_A * Math.log(stepSpeed + SPEED_B) + SPEED_C + 0.5),
  );
  const rawDuration = Math.max(
    tickMs,
    Math.floor((1_000 * groundSpeed) / calculatedSpeed),
  );
  const cardinalDuration = Math.ceil(rawDuration / tickMs) * tickMs;
  return Math.min(60_000, cardinalDuration * (diagonal ? DIAGONAL_COST : 1));
}
