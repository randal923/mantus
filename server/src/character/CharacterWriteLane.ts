/**
 * Serializes, per character, the two lanes that write that character's row:
 * the memory-first item persist lane and the character snapshot save.
 *
 * Both transactions take the same `characters` row — the item persist locks it
 * `FOR UPDATE` as its first statement, the save updates it — so overlapping
 * them makes Postgres abort the SERIALIZABLE side with SQLSTATE 40001 ("could
 * not serialize access due to concurrent update"). Combat saves the character
 * on every progression award, so a looting player produces exactly that
 * overlap in bursts, and an item persist that burns its retries poisons the
 * character: every write queued behind it is dropped and their caches are
 * rebuilt from the DB.
 *
 * Ordering the two in process removes the race instead of retrying through it.
 * The wait costs nothing extra: it is the same wait Postgres would have
 * imposed on the row lock, minus the abort at the end of it.
 */
export class CharacterWriteLane {
  private readonly tails = new Map<string, Promise<unknown>>();

  run<T>(characterId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(characterId);
    // Runs on both settle paths: one lane member failing must not strand the
    // next one behind a rejected tail.
    const result = previous ? previous.then(operation, operation) : operation();
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(characterId, tail);
    void tail.then(() => {
      // Drop the key once nothing is queued behind this operation, so the map
      // does not grow with every character the server has ever written.
      if (this.tails.get(characterId) === tail) this.tails.delete(characterId);
    });
    return result;
  }
}
