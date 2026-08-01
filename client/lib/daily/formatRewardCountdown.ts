/**
 * Time left to claim today's daily reward, as the reward wall shows it
 * ("22h 21m 08s", then "21m 08s" under the hour). The deadline is the
 * server-local day end it sends with the state, so this only formats the
 * remainder.
 */
export function formatRewardCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const paddedSeconds = String(seconds).padStart(2, "0");
  if (hours > 0) return `${hours}h ${minutes}m ${paddedSeconds}s`;
  if (minutes > 0) return `${minutes}m ${paddedSeconds}s`;
  return `${seconds}s`;
}
