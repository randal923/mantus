/** Canary LIGHT_DAY_LENGTH: a Tibian day is 1440 light minutes. */
const LIGHT_DAY_LENGTH = 1_440;
/** Canary DAY_LENGTH_SECONDS: one Tibian day passes per real hour. */
const DAY_LENGTH_SECONDS = 3_600;
/** Canary EVENT_LIGHTINTERVAL_MS: the clock advances in discrete steps. */
const LIGHT_INTERVAL_SECONDS = 10;
const LIGHT_STEP =
  (LIGHT_DAY_LENGTH * LIGHT_INTERVAL_SECONDS) / DAY_LENGTH_SECONDS;

/**
 * Canary's world clock, formatted as `getFormattedWorldTime()` does. Canary
 * seeds `lightHour` from the real wall-clock minute and advances it four light
 * minutes every ten real seconds, so a Tibian day tracks the real hour exactly;
 * deriving it from the clock instead of storing it keeps a restart from
 * jumping the time of day.
 */
export function worldTimeOfDay(wallClockMs: number): string {
  const secondsIntoHour = Math.floor(wallClockMs / 1_000) % DAY_LENGTH_SECONDS;
  const lightMinutes =
    (Math.floor(secondsIntoHour / LIGHT_INTERVAL_SECONDS) * LIGHT_STEP) %
    LIGHT_DAY_LENGTH;
  const hours = Math.floor(lightMinutes / 60);
  const minutes = lightMinutes % 60;
  return `${hours}:${minutes.toString().padStart(2, "0")}`;
}
