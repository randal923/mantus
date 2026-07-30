/**
 * Time left to claim today's daily reward, as the reward wall shows it
 * ("22h 21m", then "21m" under the hour). The deadline is the server-local
 * day end it sends with the state, so this only formats the remainder.
 */
export function formatRewardCountdown(remainingMs: number): string {
  const totalMinutes = Math.max(0, Math.floor(remainingMs / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
