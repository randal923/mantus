/** Formats remaining imbuement seconds as "H:MM h" like the game client. */
export function formatImbuementTime(remainingSeconds: number): string {
  const bounded = Math.max(0, remainingSeconds);
  const hours = Math.floor(bounded / 3_600);
  const minutes = Math.floor((bounded % 3_600) / 60);
  return `${hours}:${String(minutes).padStart(2, "0")}h`;
}
