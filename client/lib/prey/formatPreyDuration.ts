/**
 * Formats a server-sent seconds snapshot as "1h 59min" (or "45min" / "30s"
 * under the hour/minute). Prey and hunting-task windows display these values
 * statically; the server pushes fresh state whenever they change.
 */
export function formatPreyDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (hours > 0) return `${hours}h ${minutes}min`;
  if (minutes > 0) return `${minutes}min`;
  return `${seconds}s`;
}
