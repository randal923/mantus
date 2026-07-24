const NO_DUE: ReadonlyArray<never> = [];

/**
 * Removes and returns the entries whose executeAt has passed. Mutates the
 * queue in place (same array instance) so handlers that enqueue follow-up
 * entries during processing keep working.
 */
export function drainDue<T extends { readonly executeAt: number }>(
  queue: T[],
  now: number,
): ReadonlyArray<T> {
  if (queue.length === 0) return NO_DUE;
  const due: T[] = [];
  const remaining: T[] = [];
  for (const entry of queue) {
    (entry.executeAt <= now ? due : remaining).push(entry);
  }
  if (due.length === 0) return NO_DUE;
  queue.length = 0;
  queue.push(...remaining);
  return due;
}
