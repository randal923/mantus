/**
 * Formats imbuement seconds the way Tibia's imbuing window writes a duration:
 * "20h 0min". Distinct from `formatImbuementTime`, which renders the compact
 * "20:00h" the slot chips use.
 */
export function formatImbuementDuration(seconds: number): string {
  const bounded = Math.max(0, seconds);
  const hours = Math.floor(bounded / 3_600);
  const minutes = Math.floor((bounded % 3_600) / 60);
  return `${hours}h ${minutes}min`;
}
