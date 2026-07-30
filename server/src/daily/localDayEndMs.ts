/**
 * Epoch ms of the next server-local midnight — the moment `localDayKey`
 * changes and today's unclaimed daily reward becomes a missed day. The reward
 * wall counts down to it, and only the server can compute it: the player's
 * client may sit in any time zone.
 */
export function localDayEndMs(now: number): number {
  const date = new Date(now);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + 1,
  ).getTime();
}
